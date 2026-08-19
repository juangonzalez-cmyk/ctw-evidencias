import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BRAND_GROUPS, unifyBrand } from "@/lib/brands";
import { FASES, FASE_LABEL, getFase, type Fase } from "@/lib/fases";
import type { Tables } from "@/integrations/supabase/types";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildSponsorEvidencePdf } from "@/lib/buildSponsorPdf";
import { cn } from "@/lib/utils";
import {
  formatEntregaBogota,
  isStandRecepcion,
} from "@/lib/standRecepcion";
import { evidenceKindLabel, listEvidencias } from "@/lib/evidencias";
import { isLinkEvidence, linkDisplayHost } from "@/lib/upload";
import { fetchAllPages } from "@/lib/supabasePage";

type Task = Tables<"tasks">;
type Question = Tables<"survey_questions">;

type AnswerMap = Record<string, string | number>;

type StoredAnswer = {
  question_id: string;
  prompt: string;
  question_type: string;
  value: string | number | null;
};

function isPublicStorageUrl(url: string) {
  return url.includes("supabase.co") || url.includes("/evidencias/");
}

function canShowAsImage(url: string) {
  if (/\.(mp4|webm|mov|m4v|pdf)(\?|$)/i.test(url)) return false;
  if (isPublicStorageUrl(url)) return true;
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url);
}

function parseOptions(q: Question): string[] {
  const raw = q.options as unknown;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

const DEFAULT_QUESTIONS = [
  {
    prompt: "¿Qué tan satisfecho estás con la entrega de tus beneficios?",
    question_type: "scale_10",
    required: true,
    sort_order: 0,
  },
  {
    prompt: "¿La calidad de las evidencias cumplió tus expectativas?",
    question_type: "scale_10",
    required: true,
    sort_order: 1,
  },
  {
    prompt: "¿Recomendarías patrocinar de nuevo Colombia Tech Week?",
    question_type: "yes_no",
    required: true,
    sort_order: 2,
  },
  {
    prompt: "Comentarios o sugerencias",
    question_type: "text",
    required: false,
    sort_order: 3,
  },
];

export default function SponsorReport() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const staffView = searchParams.get("interno") === "1";
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const goHome = () => {
    navigate("/", { replace: false });
  };

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sponsorName, setSponsorName] = useState("");
  const [eventName, setEventName] = useState("CTW");
  const [eventId, setEventId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [surveyDone, setSurveyDone] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<StoredAnswer[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("Encuesta de satisfacción");
  const [surveyDesc, setSurveyDesc] = useState("");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data: report } = await supabase
        .from("sponsor_reports")
        .select("id, event_id, sponsor_unified_name")
        .eq("token", token)
        .maybeSingle();

      if (cancelled) return;
      if (!report) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setReportId(report.id);
      setEventId(report.event_id);
      setSponsorName(report.sponsor_unified_name);

      const { data: ev } = await supabase
        .from("events")
        .select("name, short_name")
        .eq("id", report.event_id)
        .maybeSingle();
      if (ev) setEventName(ev.short_name || ev.name);

      const { data: taskRows, error: tasksErr } = await fetchAllPages<Task>((from, to) =>
        supabase
          .from("tasks")
          .select("*")
          .eq("event_id", report.event_id)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to)
      );
      if (tasksErr) console.error(tasksErr);

      const variants = new Set(
        (BRAND_GROUPS[report.sponsor_unified_name] || [report.sponsor_unified_name]).map((v) =>
          v.trim().toLowerCase()
        )
      );
      const mine = (taskRows ?? []).filter((t) => {
        const u = unifyBrand(t.marca).trim().toLowerCase();
        const raw = (t.marca || "").trim().toLowerCase();
        return (
          variants.has(raw) ||
          u === report.sponsor_unified_name.trim().toLowerCase() ||
          variants.has(u)
        );
      });
      setTasks(mine);

      // Plantilla + preguntas (si no hay, sembrar defaults para no saltarse el gate)
      let { data: tpl } = await supabase
        .from("survey_templates")
        .select("*")
        .eq("event_id", report.event_id)
        .eq("active", true)
        .maybeSingle();

      if (!tpl) {
        const { data: created } = await supabase
          .from("survey_templates")
          .insert({
            event_id: report.event_id,
            title: "Encuesta de satisfacción",
            description:
              "Antes de ver el informe de evidencias debes completar esta encuesta.",
            active: true,
          })
          .select("*")
          .single();
        tpl = created;
      }

      if (tpl) {
        setSurveyTitle(tpl.title);
        setSurveyDesc(
          tpl.description ||
            "Antes de ver el informe de evidencias debes completar esta encuesta."
        );

        let { data: qs } = await supabase
          .from("survey_questions")
          .select("*")
          .eq("template_id", tpl.id)
          .eq("active", true)
          .order("sort_order", { ascending: true });

        if (!qs || qs.length === 0) {
          await supabase.from("survey_questions").insert(
            DEFAULT_QUESTIONS.map((q) => ({
              template_id: tpl!.id,
              ...q,
              options: [],
              active: true,
            }))
          );
          const reloaded = await supabase
            .from("survey_questions")
            .select("*")
            .eq("template_id", tpl.id)
            .eq("active", true)
            .order("sort_order", { ascending: true });
          qs = reloaded.data ?? [];
        }
        if (!cancelled) setQuestions(qs ?? []);
      }

      const { data: response } = await supabase
        .from("survey_responses")
        .select("id, answers")
        .eq("sponsor_report_id", report.id)
        .maybeSingle();

      if (response) {
        const list = Array.isArray(response.answers)
          ? (response.answers as StoredAnswer[])
          : [];
        // Solo desbloquear si hay respuestas reales (evita bypass con insert vacío)
        const hasRealAnswers = list.some(
          (a) => a && a.value !== null && a.value !== undefined && a.value !== ""
        );
        if (!cancelled) {
          setSurveyDone(hasRealAnswers);
          setSavedAnswers(hasRealAnswers ? list : []);
        }
      } else if (!cancelled) {
        setSurveyDone(false);
        setSavedAnswers([]);
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (sponsorName) {
      document.title = `Informe — ${sponsorName} · ${eventName}`;
    }
  }, [sponsorName, eventName, surveyDone]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== "rechazado"),
    [tasks]
  );

  const approvedOrEvidence = useMemo(
    () =>
      activeTasks.filter(
        (t) =>
          listEvidencias(t).length > 0 ||
          !!t.evidencia_url ||
          (isStandRecepcion(t) && !!t.acta_recepcion_url)
      ),
    [activeTasks]
  );

  const canDownloadPdf = approvedOrEvidence.length > 0;

  const byFase = useMemo(() => {
    const out: Record<Fase, Task[]> = {
      pre_evento: [],
      durante_evento: [],
      post_evento: [],
    };
    for (const t of approvedOrEvidence) out[getFase(t)].push(t);
    return out;
  }, [approvedOrEvidence]);

  const submitSurvey = async () => {
    if (!reportId || !eventId) return;
    if (questions.length === 0) {
      toast.error("La encuesta no tiene preguntas configuradas");
      return;
    }
    for (const q of questions) {
      if (q.required && (answers[q.id] === undefined || answers[q.id] === "")) {
        toast.error("Completa todas las preguntas obligatorias");
        return;
      }
    }
    setSubmitting(true);
    const payload: StoredAnswer[] = questions.map((q) => ({
      question_id: q.id,
      prompt: q.prompt,
      question_type: q.question_type,
      value: answers[q.id] ?? null,
    }));
    const { error } = await supabase.from("survey_responses").upsert(
      {
        event_id: eventId,
        sponsor_report_id: reportId,
        answers: payload,
      },
      { onConflict: "sponsor_report_id" }
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSavedAnswers(payload);
    setSurveyDone(true);
    toast.success("Encuesta guardada");
  };

  const downloadPdf = async () => {
    if (!canDownloadPdf) {
      toast.error("Aún no hay evidencias para armar el PDF");
      return;
    }
    setPdfBusy(true);
    try {
      const blob = await buildSponsorEvidencePdf({
        sponsorName,
        eventName,
        tasks: activeTasks,
        surveyAnswers: savedAnswers.length
          ? savedAnswers.map((a) => ({
              prompt: a.prompt,
              value: a.value,
            }))
          : undefined,
      });
      const filename = `informe_${sponsorName.replace(/\s+/g, "_")}_${eventName.replace(/\s+/g, "_")}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      // En iOS/PWA preferir share: evita que el visor de PDF reemplace la app.
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Informe ${sponsorName}`,
            text: `Informe de evidencias · ${eventName}`,
          });
          toast.success("PDF listo para compartir");
          return;
        } catch (shareErr) {
          // Usuario canceló el share → no es error
          if ((shareErr as Error)?.name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revocar un poco después para no romper descargas lentas
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("PDF descargado — puedes seguir en esta pantalla");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="px-4 pt-4 safe-top">
          <BackLink onBack={goHome} />
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold">Informe no encontrado</h1>
            <p className="text-sm text-muted-foreground mt-2">
              El link es inválido o ya no está disponible.
            </p>
            <Button className="mt-6" variant="outline" onClick={goHome}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a la app
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero text-white px-5 safe-top pb-8">
        <div className="max-w-3xl mx-auto">
          <BackLink onBack={goHome} light />
          <div className="mt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/60">{eventName}</div>
              <h1 className="text-3xl font-bold mt-1">Informe · {sponsorName}</h1>
              <p className="text-sm text-white/70 mt-2">
                {approvedOrEvidence.length} evidencias · {activeTasks.length} beneficios
                {approvedOrEvidence.length === activeTasks.length && activeTasks.length > 0
                  ? " · Completo"
                  : " · En progreso"}
              </p>
            </div>
            <Button
              onClick={() => void downloadPdf()}
              disabled={!canDownloadPdf || pdfBusy}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              title={
                canDownloadPdf
                  ? "Descargar PDF"
                  : "Disponible cuando haya al menos una evidencia"
              }
            >
              {pdfBusy ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FileDown className="w-4 h-4 mr-2" />
              )}
              Descargar PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {!canDownloadPdf && (
          <div className="mb-6 rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm">
            El PDF se habilita cuando haya al menos una evidencia cargada para este patrocinador.
          </div>
        )}

        {!surveyDone && !staffView && questions.length > 0 && (
          <section className="mb-8 space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {surveyTitle || "Encuesta"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Opcional. El PDF se puede descargar sin responder.
              </p>
            </div>
            {questions.map((q) => {
              const opts = parseOptions(q);
              return (
                <div key={q.id} className="card-task space-y-2">
                  <div className="text-sm font-semibold">
                    {q.prompt}
                    {q.required && <span className="text-muted-foreground ml-1">(opcional)</span>}
                  </div>
                  {q.question_type === "scale" && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-sm font-bold border",
                            answers[q.id] === n
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.question_type === "scale_10" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                            className={cn(
                              "py-2.5 rounded-xl text-sm font-bold border",
                              answers[q.id] === n
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card border-border"
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {q.question_type === "yes_no" && (
                    <div className="flex gap-2">
                      {["Sí", "No"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-sm font-bold border",
                            answers[q.id] === opt
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.question_type === "choice" && (
                    <div className="space-y-2">
                      {(opts.length ? opts : ["Opción A", "Opción B"]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                          className={cn(
                            "w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold border",
                            answers[q.id] === opt
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.question_type === "text" && (
                    <textarea
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm min-h-[88px]"
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                      }
                    />
                  )}
                </div>
              );
            })}
            <Button onClick={submitSurvey} disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar encuesta"}
            </Button>
          </section>
        )}

        <div ref={reportRef} className="space-y-8 bg-background p-2">
          {FASES.map((fase) => {
            const list = byFase[fase];
            if (!list.length) return null;
            return (
              <section key={fase}>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  {FASE_LABEL[fase]}
                </h2>
                <div className="space-y-3">
                  {list.map((t) => (
                    <article key={t.id} className="card-task">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{t.tipo_beneficio}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {t.marca}
                            {t.dia ? ` · ${t.dia}` : ""}
                            {t.hora ? ` · ${t.hora}` : ""}
                          </div>
                        </div>
                        <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-primary/15 text-foreground">
                          {t.status}
                        </span>
                      </div>
                      {listEvidencias(t).map((item) => {
                        const itemIsLink =
                          item.kind === "link" || isLinkEvidence(item.url, item.kind);
                        return (
                          <div key={item.id} className="mt-3">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                              {evidenceKindLabel(item.kind)}
                              {item.label ? ` · ${item.label}` : ""}
                            </div>
                            {/\.(mp4|webm|mov)(\?|$)/i.test(item.url) || item.kind === "video" ? (
                              <video
                                src={item.url}
                                controls
                                className="w-full rounded-xl max-h-72 bg-black"
                              />
                            ) : canShowAsImage(item.url) && !itemIsLink ? (
                              <img
                                src={item.url}
                                alt={t.tipo_beneficio}
                                className="w-full rounded-xl max-h-80 object-contain bg-muted/30"
                                crossOrigin="anonymous"
                              />
                            ) : (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-xl border border-border bg-muted/40 px-3 py-3 text-xs text-primary font-semibold truncate"
                              >
                                {itemIsLink
                                  ? `Abrir link · ${linkDisplayHost(item.url)}`
                                  : item.url.includes("/evidencias/")
                                    ? "Abrir archivo"
                                    : `Abrir · ${item.url}`}
                              </a>
                            )}
                          </div>
                        );
                      })}
                      {isStandRecepcion(t) && (
                        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                          {t.acta_recepcion_url && (
                            <img
                              src={t.acta_recepcion_url}
                              alt={`Acta ${t.marca}`}
                              className="w-full rounded-xl max-h-80 object-contain bg-white border border-border"
                              crossOrigin="anonymous"
                            />
                          )}
                          <div>
                            Firmante: {t.firma_nombre || "—"}
                          </div>
                          <div>
                            Entrega CTW: {formatEntregaBogota(t.entrega_ctw_at)} · Sponsor:{" "}
                            {formatEntregaBogota(t.entrega_sponsor_at)}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          {approvedOrEvidence.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Aún no hay evidencias cargadas para este sponsor.
            </p>
          )}

          <footer className="pt-6 border-t border-border text-xs text-muted-foreground text-center">
            Generado por {eventName} · Colombia Tech Week
          </footer>
        </div>
      </main>
    </div>
  );
}

function BackLink({ onBack, light }: { onBack: () => void; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80",
        light ? "text-white/85" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <ArrowLeft className="w-4 h-4" />
      Volver a la app
    </button>
  );
}
