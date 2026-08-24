import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BRAND_GROUPS, unifyBrand } from "@/lib/brands";
import type { Tables } from "@/integrations/supabase/types";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildSponsorEvidencePdf } from "@/lib/buildSponsorPdf";
import { cn } from "@/lib/utils";
import { formatEntregaBogota, isStandRecepcion } from "@/lib/standRecepcion";
import { evidenceKindLabel, listEvidencias } from "@/lib/evidencias";
import { isLinkEvidence, linkDisplayHost } from "@/lib/upload";
import { fetchAllPages } from "@/lib/supabasePage";
import { downloadPdfFile, sanitizePdfFilename } from "@/lib/sponsorReports";
import {
  benefitTitle,
  buildReportBuckets,
  buildThankYouIntro,
  FASES,
  FASE_LABEL,
  formatReportDateTime,
  lastEvidenceAt,
  taskHasEvidence,
} from "@/lib/sponsorReportModel";
import {
  DEFAULT_EVENT_HIGHLIGHT_STATS,
  EVENT_HIGHLIGHT_ACCENT_HEX,
  EVENT_HIGHLIGHT_SUBTITLE,
  EVENT_HIGHLIGHT_TITLE,
  type EventHighlightStat,
} from "@/lib/eventHighlightStats";
import { isMillaExtra } from "@/lib/tipoEntrega";

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

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sponsorName, setSponsorName] = useState("");
  const [eventName, setEventName] = useState("CTW");
  const [eventFullName, setEventFullName] = useState("Colombia Tech Week");
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [surveyDone, setSurveyDone] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<StoredAnswer[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("Encuesta de satisfacción");
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
        .select("name, short_name, starts_on, ends_on")
        .eq("id", report.event_id)
        .maybeSingle();
      if (ev) {
        setEventName(ev.short_name || ev.name);
        setEventFullName(ev.name);
        setStartsOn(ev.starts_on);
        setEndsOn(ev.ends_on);
      }

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

      const unified = unifyBrand(report.sponsor_unified_name);
      const variants = new Set(
        (
          BRAND_GROUPS[unified] ||
          BRAND_GROUPS[report.sponsor_unified_name] || [report.sponsor_unified_name, unified]
        ).map((v) => v.trim().toLowerCase())
      );
      variants.add(unified.trim().toLowerCase());
      variants.add(report.sponsor_unified_name.trim().toLowerCase());
      const mine = (taskRows ?? []).filter((t) => {
        const u = unifyBrand(t.marca).trim().toLowerCase();
        const raw = (t.marca || "").trim().toLowerCase();
        return variants.has(raw) || variants.has(u) || u === unified.trim().toLowerCase();
      });
      setTasks(mine);

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
            description: "Opcional. Cuéntanos tu experiencia como sponsor.",
            active: true,
          })
          .select("*")
          .single();
        tpl = created;
      }

      if (tpl) {
        setSurveyTitle(tpl.title);
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
    if (sponsorName) document.title = `Informe — ${sponsorName} · ${eventName}`;
  }, [sponsorName, eventName]);

  const buckets = useMemo(() => buildReportBuckets(tasks), [tasks]);
  const thankYou = useMemo(
    () =>
      buildThankYouIntro({
        sponsorName,
        eventName: eventFullName || eventName,
        startsOn,
        endsOn,
        withEvidenceCount: buckets.withEvidence.length,
      }),
    [sponsorName, eventFullName, eventName, startsOn, endsOn, buckets.withEvidence.length]
  );
  const updatedAt = useMemo(() => lastEvidenceAt(buckets.active), [buckets.active]);
  const canDownloadPdf = buckets.withEvidence.length > 0;

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
        eventName: eventFullName || eventName,
        eventShortName: eventName,
        startsOn,
        endsOn,
        tasks: buckets.active,
        surveyAnswers: savedAnswers.length
          ? savedAnswers.map((a) => ({ prompt: a.prompt, value: a.value }))
          : undefined,
      });
      const filename = `informe_${sanitizePdfFilename(sponsorName)}_${sanitizePdfFilename(eventName)}.pdf`;
      downloadPdfFile(blob, filename);
      toast.success("PDF descargado");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#96e631]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Informe no encontrado</h1>
          <p className="text-sm text-muted-foreground mt-2">
            El link es inválido o ya no está disponible. Pide al equipo CTW un enlace nuevo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* 01 Hero */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, #143d0f 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, #1a2e0a 0%, transparent 40%), #000",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-12 safe-top">
          {staffView ? (
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Volver a la app
            </button>
          ) : (
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#96e631]/font-semibold mb-6">
              Informe público · Colombia Tech Week
            </div>
          )}

          <div className="text-[11px] uppercase tracking-[0.3em] text-white/45 font-semibold">
            01 / Informe de sponsor
          </div>
          <p className="mt-6 text-lg text-white/70">Hola equipo</p>
          <h1 className="mt-1 text-4xl sm:text-5xl font-bold tracking-tight">{sponsorName}</h1>
          <p className="mt-3 text-sm text-white/55">
            {eventFullName || eventName} · Colombia Tech Week
          </p>

          <div className="mt-8 space-y-3 max-w-2xl">
            <p className="text-base leading-relaxed text-white/85">{thankYou.headline}</p>
            <p className="text-sm leading-relaxed text-white/65">{thankYou.body}</p>
            <p className="text-base leading-relaxed text-white font-medium pt-2">
              {thankYou.closing}{" "}
              <span aria-hidden>🤍</span> <span aria-hidden>🇨🇴</span>
            </p>
          </div>

          <div className="mt-8">
            <Button
              onClick={() => void downloadPdf()}
              disabled={!canDownloadPdf || pdfBusy}
              className="bg-[#96e631] text-black hover:bg-[#96e631]/90 font-semibold"
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

      <main className="max-w-3xl mx-auto px-5 py-10 space-y-14">
        {/* 02 El evento en números */}
        <section>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/45 font-semibold mb-5">
            02 / {EVENT_HIGHLIGHT_TITLE}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{EVENT_HIGHLIGHT_TITLE}</h2>
          <p className="mt-3 text-sm text-white/60 max-w-2xl leading-relaxed">
            {EVENT_HIGHLIGHT_SUBTITLE}
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DEFAULT_EVENT_HIGHLIGHT_STATS.map((stat) => (
              <EventHighlightCard key={stat.label} stat={stat} />
            ))}
          </div>
          <p className="mt-4 text-xs text-white/40">
            Última actualización: {formatReportDateTime(updatedAt)}
          </p>
        </section>

        {/* Encuesta opcional */}
        {!surveyDone && !staffView && questions.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/50">
                {surveyTitle || "Encuesta"}
              </h2>
              <p className="text-xs text-white/40 mt-1">
                Opcional. El PDF se puede descargar sin responder.
              </p>
            </div>
            {questions.map((q) => {
              const opts = parseOptions(q);
              return (
                <div key={q.id} className="space-y-2">
                  <div className="text-sm font-semibold text-white/90">{q.prompt}</div>
                  {q.question_type === "scale_10" && (
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                          className={cn(
                            "py-2.5 rounded-xl text-sm font-bold border",
                            answers[q.id] === n
                              ? "bg-[#96e631] text-black border-[#96e631]"
                              : "bg-white/5 border-white/15 text-white/80"
                          )}
                        >
                          {n}
                        </button>
                      ))}
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
                              ? "bg-[#96e631] text-black border-[#96e631]"
                              : "bg-white/5 border-white/15"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.question_type === "text" && (
                    <textarea
                      className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm min-h-[88px] text-white"
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  )}
                  {(q.question_type === "scale" || q.question_type === "choice") && (
                    <div className={q.question_type === "scale" ? "flex gap-2" : "space-y-2"}>
                      {(q.question_type === "scale"
                        ? [1, 2, 3, 4, 5]
                        : opts.length
                          ? opts
                          : ["Opción A", "Opción B"]
                      ).map((opt) => (
                        <button
                          key={String(opt)}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                          className={cn(
                            "rounded-xl text-sm font-bold border",
                            q.question_type === "scale" ? "flex-1 py-2" : "w-full text-left px-3 py-2.5",
                            answers[q.id] === opt
                              ? "bg-[#96e631] text-black border-[#96e631]"
                              : "bg-white/5 border-white/15"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              onClick={submitSurvey}
              disabled={submitting}
              className="bg-[#96e631] text-black hover:bg-[#96e631]/90"
            >
              {submitting ? "Enviando…" : "Enviar encuesta"}
            </Button>
          </section>
        )}

        {/* 03 Evidencias contractuales */}
        <section className="space-y-8">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/45 font-semibold">
            03 / Evidencias entregadas
          </div>

          {FASES.map((fase) => {
            const list = buckets.byFaseContractual[fase];
            if (!list.length) return null;
            return (
              <div key={fase}>
                <h2 className="text-xl font-bold mb-4 text-white">{FASE_LABEL[fase]}</h2>
                <div className="space-y-6">
                  {list.map((t) => (
                    <EvidenceCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            );
          })}

          {buckets.contractualWithEvidence.length === 0 && (
            <p className="text-sm text-white/45 py-6">
              Aún no hay evidencias contractuales cargadas para este sponsor.
            </p>
          )}
        </section>

        {/* Milla extra */}
        {buckets.millaExtra.length > 0 && (
          <section className="rounded-3xl border border-[#96e631]/35 bg-gradient-to-br from-[#96e631]/10 to-transparent p-6 sm:p-8 space-y-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#96e631] font-semibold">
                Extra / Más allá del contrato
              </div>
              <h2 className="mt-3 text-2xl font-bold leading-tight">
                Desde Customer Success damos una milla extra por ti
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Beneficios Tailor made o adicionales entregados más allá de lo contratado (
                {buckets.millaExtraWithEvidence.length} con evidencia de {buckets.millaExtra.length}).
              </p>
            </div>
            <div className="space-y-6">
              {buckets.millaExtra.map((t) =>
                taskHasEvidence(t) ? (
                  <EvidenceCard key={t.id} task={t} accent />
                ) : (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-[#96e631]/25 bg-black/30 px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{benefitTitle(t)}</div>
                      <div className="text-[11px] text-[#96e631]/70 mt-0.5">Milla extra · en progreso</div>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-white/10 text-white/60 shrink-0">
                      Pendiente
                    </span>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* Pendientes (contractuales sin evidencia; milla extra va en su sección) */}
        {buckets.pending.filter((t) => !isMillaExtra(t)).length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/45 mb-3">
              En progreso ({buckets.pending.filter((t) => !isMillaExtra(t)).length})
            </h2>
            <ul className="space-y-2">
              {buckets.pending
                .filter((t) => !isMillaExtra(t))
                .map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{benefitTitle(t)}</div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {isMillaExtra(t) ? "Milla extra · " : ""}
                      {t.marca}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-white/10 text-white/60 shrink-0">
                    Pendiente
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="pt-8 pb-16 border-t border-white/10 text-center space-y-3">
          <p className="text-base text-white/80 max-w-xl mx-auto leading-relaxed">
            ¡Gracias por sumarte al sueño de poner a Colombia en el mapa por su talento, su
            ecosistema tech y la visión de un país que adopta la tecnología con propósito!
          </p>
          <p className="text-xs text-white/40">
            Generado por {eventName} · Colombia Tech Week
            {updatedAt ? ` · Actualizado ${formatReportDateTime(updatedAt)}` : ""}
          </p>
        </footer>
      </main>
    </div>
  );
}

function EventHighlightCard({ stat }: { stat: EventHighlightStat }) {
  const accent = EVENT_HIGHLIGHT_ACCENT_HEX[stat.accent];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="px-4 py-5 text-center">
        <div className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: accent }}>
          {stat.value}
        </div>
        <div className="mt-2 text-sm text-white/75 font-medium">{stat.label}</div>
      </div>
    </div>
  );
}

function EvidenceCard({ task, accent }: { task: Task; accent?: boolean }) {
  const items = listEvidencias(task);
  const meta = [task.dia, task.hora, task.stage, task.speaker].filter(Boolean).join(" · ");

  return (
    <article
      className={cn(
        "rounded-2xl overflow-hidden border",
        accent ? "border-[#96e631]/25 bg-black/30" : "border-white/10 bg-white/[0.03]"
      )}
    >
      <div className="px-4 pt-4 pb-2">
        <div className="font-semibold text-lg leading-snug">{benefitTitle(task)}</div>
        {meta ? <div className="text-xs text-white/45 mt-1">{meta}</div> : null}
      </div>

      <div className="px-4 pb-4 space-y-3">
        {items.map((item) => {
          const itemIsLink = item.kind === "link" || isLinkEvidence(item.url, item.kind);
          return (
            <div key={item.id}>
              <div className="text-[10px] uppercase font-bold text-white/40 mb-1.5">
                {evidenceKindLabel(item.kind)}
                {item.label ? ` · ${item.label}` : ""}
              </div>
              {/\.(mp4|webm|mov)(\?|$)/i.test(item.url) || item.kind === "video" ? (
                <video src={item.url} controls className="w-full rounded-xl max-h-80 bg-black" />
              ) : canShowAsImage(item.url) && !itemIsLink ? (
                <img
                  src={item.url}
                  alt={benefitTitle(task)}
                  className="w-full rounded-xl max-h-[28rem] object-contain bg-black/40"
                  crossOrigin="anonymous"
                />
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-xs text-[#96e631] font-semibold truncate"
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

        {isStandRecepcion(task) && (
          <div className="space-y-2 text-xs text-white/55 pt-1">
            {task.acta_recepcion_url && (
              <img
                src={task.acta_recepcion_url}
                alt={`Acta ${task.marca}`}
                className="w-full rounded-xl max-h-80 object-contain bg-white"
                crossOrigin="anonymous"
              />
            )}
            <div>Firmante: {task.firma_nombre || "—"}</div>
            <div>
              Entrega CTW: {formatEntregaBogota(task.entrega_ctw_at)} · Sponsor:{" "}
              {formatEntregaBogota(task.entrega_sponsor_at)}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
