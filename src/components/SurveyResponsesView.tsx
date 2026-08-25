import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Loader2, MessageSquareText, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SurveyResponse = Tables<"survey_responses">;
type StoredAnswer = {
  question_id?: string;
  prompt?: string;
  question_type?: string;
  value?: string | number | null;
};

type Row = {
  id: string;
  created_at: string;
  sponsorName: string;
  answers: StoredAnswer[];
};

function parseAnswers(raw: SurveyResponse["answers"]): StoredAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== "object") return { value: null };
    const o = item as Record<string, unknown>;
    return {
      question_id: typeof o.question_id === "string" ? o.question_id : undefined,
      prompt: typeof o.prompt === "string" ? o.prompt : undefined,
      question_type: typeof o.question_type === "string" ? o.question_type : undefined,
      value:
        typeof o.value === "string" || typeof o.value === "number" || o.value === null
          ? (o.value as string | number | null)
          : String(o.value ?? ""),
    };
  });
}

function formatAnswerValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    });
  } catch {
    return iso;
  }
}

export function SurveyResponsesView({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: responses, error: respErr } = await supabase
        .from("survey_responses")
        .select("id,sponsor_report_id,answers,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (respErr) throw respErr;

      const list = responses ?? [];
      const reportIds = [...new Set(list.map((r) => r.sponsor_report_id))];
      let nameById: Record<string, string> = {};
      if (reportIds.length) {
        const { data: reports, error: repErr } = await supabase
          .from("sponsor_reports")
          .select("id,sponsor_unified_name")
          .in("id", reportIds);
        if (repErr) throw repErr;
        nameById = Object.fromEntries(
          (reports ?? []).map((r) => [r.id, r.sponsor_unified_name])
        );
      }

      setRows(
        list.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          sponsorName: nameById[r.sponsor_report_id] || "Sponsor",
          answers: parseAnswers(r.answers),
        }))
      );
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "No se pudieron cargar las respuestas");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.sponsorName.toLowerCase().includes(q) ||
        r.answers.some(
          (a) =>
            (a.prompt || "").toLowerCase().includes(q) ||
            String(a.value ?? "")
              .toLowerCase()
              .includes(q)
        )
    );
  }, [rows, query]);

  const avgByPrompt = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      for (const a of r.answers) {
        const prompt = a.prompt || "Pregunta";
        const num = typeof a.value === "number" ? a.value : Number(a.value);
        if (!Number.isFinite(num)) continue;
        const cur = map.get(prompt) || { sum: 0, n: 0 };
        cur.sum += num;
        cur.n += 1;
        map.set(prompt, cur);
      }
    }
    return [...map.entries()]
      .filter(([, v]) => v.n > 0)
      .map(([prompt, v]) => ({
        prompt,
        avg: Math.round((v.sum / v.n) * 10) / 10,
        n: v.n,
      }));
  }, [rows]);

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm space-y-3">
        <p>{error}</p>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-primary" />
            Respuestas de sponsors
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rows.length === 0
              ? "Aún no hay encuestas respondidas."
              : `${rows.length} sponsor${rows.length === 1 ? "" : "s"} respondieron.`}
          </p>
        </div>
        <Button size="icon" variant="outline" onClick={() => void load()} aria-label="Actualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {avgByPrompt.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {avgByPrompt.map((s) => (
            <div key={s.prompt} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold line-clamp-2">
                {s.prompt}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">{s.avg}</span>
                <span className="text-[11px] text-muted-foreground">promedio · {s.n} resp.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por sponsor o respuesta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Cuando un sponsor complete la encuesta del informe, aparecerá aquí."
            : "Ninguna respuesta coincide con la búsqueda."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const open = expandedId === row.id;
            return (
              <li key={row.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : row.id)}
                  className="w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{row.sponsorName}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatWhen(row.created_at)} · {row.answers.length} respuesta
                      {row.answers.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0",
                      open ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {open ? "Ocultar" : "Ver"}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-border px-3.5 py-3 space-y-3 bg-muted/20">
                    {row.answers.map((a, idx) => (
                      <div key={`${row.id}-${a.question_id || idx}`} className="space-y-1">
                        <div className="text-xs text-muted-foreground leading-snug">
                          {a.prompt || `Pregunta ${idx + 1}`}
                        </div>
                        <div className="text-sm font-semibold whitespace-pre-wrap">
                          {formatAnswerValue(a.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
