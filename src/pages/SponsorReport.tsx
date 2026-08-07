import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BRAND_GROUPS, unifyBrand } from "@/lib/brands";
import { FASES, FASE_LABEL, getFase, type Fase } from "@/lib/fases";
import type { Tables } from "@/integrations/supabase/types";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildSponsorEvidencePdf } from "@/lib/buildSponsorPdf";

type Task = Tables<"tasks">;
type Question = Tables<"survey_questions">;

type AnswerMap = Record<string, string | number>;

function isPublicStorageUrl(url: string) {
  return url.includes("supabase.co") || url.includes("/evidencias/");
}

function canShowAsImage(url: string) {
  if (/\.(mp4|webm|mov|m4v|pdf)(\?|$)/i.test(url)) return false;
  if (isPublicStorageUrl(url)) return true;
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url);
}

export default function SponsorReport() {
  const { token } = useParams<{ token: string }>();
  const reportRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sponsorName, setSponsorName] = useState("");
  const [eventName, setEventName] = useState("CTW");
  const [eventId, setEventId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [surveyDone, setSurveyDone] = useState(false);
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

      const { data: taskRows } = await supabase
        .from("tasks")
        .select("*")
        .eq("event_id", report.event_id)
        .is("deleted_at", null)
        .limit(2000);

      const variants = new Set(
        (BRAND_GROUPS[report.sponsor_unified_name] || [report.sponsor_unified_name]).map((v) =>
          v.trim().toLowerCase()
        )
      );
      const mine = (taskRows ?? []).filter((t) => {
        const u = unifyBrand(t.marca).trim().toLowerCase();
        const raw = (t.marca || "").trim().toLowerCase();
        return variants.has(raw) || u === report.sponsor_unified_name.trim().toLowerCase() || variants.has(u);
      });
      setTasks(mine);

      const { data: response } = await supabase
        .from("survey_responses")
        .select("id")
        .eq("sponsor_report_id", report.id)
        .maybeSingle();
      setSurveyDone(!!response);

      const { data: tpl } = await supabase
        .from("survey_templates")
        .select("*")
        .eq("event_id", report.event_id)
        .eq("active", true)
        .maybeSingle();

      if (tpl) {
        setSurveyTitle(tpl.title);
        setSurveyDesc(tpl.description || "");
        const { data: qs } = await supabase
          .from("survey_questions")
          .select("*")
          .eq("template_id", tpl.id)
          .eq("active", true)
          .order("sort_order", { ascending: true });
        setQuestions(qs ?? []);
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (sponsorName) {
      document.title = `Informe — ${sponsorName} · ${eventName}`;
    }
  }, [sponsorName, eventName]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== "rechazado"),
    [tasks]
  );

  const approvedOrEvidence = useMemo(
    () => activeTasks.filter((t) => !!t.evidencia_url),
    [activeTasks]
  );

  const allComplete = useMemo(() => {
    if (activeTasks.length === 0) return false;
    return activeTasks.every(
      (t) => !!t.evidencia_url && (t.status === "aprobada" || t.status === "por_validar")
    );
  }, [activeTasks]);

  const allApproved = useMemo(() => {
    if (activeTasks.length === 0) return false;
    return activeTasks.every((t) => !!t.evidencia_url && t.status === "aprobada");
  }, [activeTasks]);

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
    for (const q of questions) {
      if (q.required && (answers[q.id] === undefined || answers[q.id] === "")) {
        toast.error("Completa todas las preguntas obligatorias");
        return;
      }
    }
    setSubmitting(true);
    const payload = questions.map((q) => ({
      question_id: q.id,
      prompt: q.prompt,
      question_type: q.question_type,
      value: answers[q.id] ?? null,
    }));
    const { error } = await supabase.from("survey_responses").insert({
      event_id: eventId,
      sponsor_report_id: reportId,
      answers: payload,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSurveyDone(true);
    toast.success("Gracias. Ya puedes ver el informe.");
  };

  const downloadPdf = async () => {
    if (!allApproved) {
      toast.error("El PDF se habilita cuando todos los beneficios están aprobados");
      return;
    }
    setPdfBusy(true);
    try {
      const blob = await buildSponsorEvidencePdf({
        sponsorName,
        eventName,
        tasks: activeTasks,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe_${sponsorName.replace(/\s+/g, "_")}_${eventName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF listo — evidencias embebidas");
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
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Informe no encontrado</h1>
          <p className="text-sm text-muted-foreground mt-2">
            El link es inválido o ya no está disponible.
          </p>
        </div>
      </div>
    );
  }

  if (!surveyDone) {
    return (
      <div className="min-h-screen bg-background">
        <header className="gradient-hero text-white px-5 py-8">
          <div className="max-w-lg mx-auto">
            <div className="text-xs uppercase tracking-[0.2em] text-white/60">Colombia Tech Week</div>
            <h1 className="text-2xl font-bold mt-2">{surveyTitle}</h1>
            <p className="text-sm text-white/70 mt-2">
              {surveyDesc || `Antes de ver el informe de ${sponsorName}, responde esta breve encuesta.`}
            </p>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-5 py-6 space-y-5">
          {questions.map((q) => (
            <div key={q.id} className="card-task space-y-2">
              <div className="text-sm font-semibold">
                {q.prompt}
                {q.required && <span className="text-destructive ml-1">*</span>}
              </div>
              {q.question_type === "scale" && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border ${
                        answers[q.id] === n
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border"
                      }`}
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
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border ${
                        answers[q.id] === opt
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border"
                      }`}
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
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <Button className="w-full" onClick={submitSurvey} disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar y ver informe"}
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero text-white px-5 py-8">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/60">{eventName}</div>
            <h1 className="text-3xl font-bold mt-1">Informe · {sponsorName}</h1>
            <p className="text-sm text-white/70 mt-2">
              {approvedOrEvidence.length} evidencias · {activeTasks.length} beneficios
              {allComplete ? " · Completo" : " · En progreso"}
            </p>
          </div>
          <Button
            onClick={downloadPdf}
            disabled={!allApproved || pdfBusy}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            title={
              allApproved
                ? "Descargar PDF"
                : "Disponible cuando todos los beneficios estén aprobados"
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
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {!allApproved && (
          <div className="mb-6 rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm">
            El PDF de entrega (con evidencias embebidas, sin links externos) se habilita cuando
            todos los beneficios estén aprobados.
          </div>
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
                      {t.evidencia_url && (
                        <div className="mt-3">
                          {/\.(mp4|webm|mov)(\?|$)/i.test(t.evidencia_url) ? (
                            <video
                              src={t.evidencia_url}
                              controls
                              className="w-full rounded-xl max-h-72 bg-black"
                            />
                          ) : canShowAsImage(t.evidencia_url) ? (
                            <img
                              src={t.evidencia_url}
                              alt={t.tipo_beneficio}
                              className="w-full rounded-xl max-h-80 object-contain bg-muted/30"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                              Evidencia pendiente de materializar en storage público para vista
                              sin permisos.
                            </div>
                          )}
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
