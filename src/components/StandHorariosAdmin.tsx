import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarClock, Loader2, RotateCcw } from "lucide-react";
import { scoreBrandMatch } from "@/lib/applyPulpoCronograma";
import { PULPO_STAND_ENTREGAS } from "@/data/pulpoStandCronograma";
import {
  bogotaLocalToIso,
  formatEntregaBogota,
  fromDatetimeLocalValue,
  isSponsorMinGapMet,
  isStandRecepcion,
  resolveStandStatusAfterEdit,
  STAND_DATETIME_STEP_SECONDS,
  STAND_SPONSOR_MIN_AFTER_CTW_MINUTES,
  toDatetimeLocalValue,
} from "@/lib/standRecepcion";
import { unifyBrand } from "@/lib/brands";

type StandRow = {
  id: string;
  marca: string;
  tipo_beneficio: string;
  category: string | null;
  flujo: string | null;
  responsable: string | null;
  status: string | null;
  evidencia_url: string | null;
  acta_recepcion_url: string | null;
  entrega_ctw_at: string | null;
  entrega_sponsor_at: string | null;
};

type Draft = {
  ctwLocal: string;
};

function pulpoIsoForMarca(marca: string): { iso: string; label: string } | null {
  let best = null as (typeof PULPO_STAND_ENTREGAS)[number] | null;
  let bestScore = 0;
  for (const e of PULPO_STAND_ENTREGAS) {
    const score = scoreBrandMatch(marca, e);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (!best || bestScore < 70) return null;
  return {
    iso: bogotaLocalToIso(best.fecha, best.hora),
    label: `${best.fecha.slice(5)} ${best.hora} · #${best.standNo || "—"} · ${best.tamaño}`,
  };
}

/**
 * Admin: ajustar horarios Pulpo→CTW de stands ya creados,
 * usando el Excel Pulpo como referencia.
 */
export function StandHorariosAdmin({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<StandRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, marca, tipo_beneficio, category, flujo, responsable, status, evidencia_url, acta_recepcion_url, entrega_ctw_at, entrega_sponsor_at, deleted_at"
        )
        .eq("event_id", eventId)
        .is("deleted_at", null);
      if (error) throw error;
      const stands = ((data ?? []) as StandRow[]).filter((t) => isStandRecepcion(t));
      stands.sort((a, b) => {
        const ta = a.entrega_ctw_at || "";
        const tb = b.entrega_ctw_at || "";
        if (ta !== tb) return ta.localeCompare(tb);
        return unifyBrand(a.marca).localeCompare(unifyBrand(b.marca), "es");
      });
      setRows(stands);
      const next: Record<string, Draft> = {};
      for (const t of stands) {
        const pulpo = pulpoIsoForMarca(t.marca);
        next[t.id] = {
          ctwLocal:
            toDatetimeLocalValue(t.entrega_ctw_at) ||
            toDatetimeLocalValue(pulpo?.iso) ||
            "",
        };
      }
      setDrafts(next);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron cargar los stands");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const enriched = useMemo(() => {
    return rows.map((t) => {
      const pulpo = pulpoIsoForMarca(t.marca);
      const draft = drafts[t.id] || { ctwLocal: "" };
      const draftIso = fromDatetimeLocalValue(draft.ctwLocal);
      const savedIso = t.entrega_ctw_at;
      const dirty =
        toDatetimeLocalValue(draftIso) !== toDatetimeLocalValue(savedIso);
      const differsFromPulpo =
        !!pulpo &&
        toDatetimeLocalValue(draftIso || savedIso) !== toDatetimeLocalValue(pulpo.iso);
      return {
        task: t,
        pulpo,
        draft,
        draftIso,
        dirty,
        differsFromPulpo,
        sponsorOk: isSponsorMinGapMet(draftIso || savedIso, t.entrega_sponsor_at),
      };
    });
  }, [rows, drafts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return enriched;
    return enriched.filter(
      (r) =>
        r.task.marca.toLowerCase().includes(needle) ||
        unifyBrand(r.task.marca).toLowerCase().includes(needle) ||
        (r.task.responsable || "").toLowerCase().includes(needle)
    );
  }, [enriched, q]);

  const dirtyCount = enriched.filter((r) => r.dirty).length;

  const setCtw = (id: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ctwLocal: value } }));
  };

  const applyPulpoTo = (ids: string[]) => {
    setDrafts((prev) => {
      const next = { ...prev };
      let n = 0;
      for (const id of ids) {
        const row = enriched.find((r) => r.task.id === id);
        if (!row?.pulpo) continue;
        next[id] = { ctwLocal: toDatetimeLocalValue(row.pulpo.iso) };
        n++;
      }
      if (!n) toast.message("Ninguna fila seleccionada tiene match en Pulpo");
      else toast.success(`Hora Pulpo aplicada a ${n} stand${n === 1 ? "" : "s"} (sin guardar aún)`);
      return next;
    });
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async (onlyIds?: string[]) => {
    const targets = enriched.filter((r) => {
      if (onlyIds && !onlyIds.includes(r.task.id)) return false;
      return r.dirty;
    });
    if (!targets.length) {
      toast.message("No hay cambios pendientes");
      return;
    }
    setSaving(true);
    try {
      let updated = 0;
      let clearedSponsor = 0;
      for (const r of targets) {
        const ctwIso = r.draftIso;
        let sponsorIso = r.task.entrega_sponsor_at;
        if (ctwIso && sponsorIso && !isSponsorMinGapMet(ctwIso, sponsorIso)) {
          sponsorIso = null;
          clearedSponsor++;
        }
        const resolved = resolveStandStatusAfterEdit(r.task.status, {
          evidencia_url: r.task.evidencia_url,
          acta_recepcion_url: r.task.acta_recepcion_url,
          entrega_ctw_at: ctwIso,
          entrega_sponsor_at: sponsorIso,
        });
        const { error } = await supabase
          .from("tasks")
          .update({
            entrega_ctw_at: ctwIso,
            entrega_sponsor_at: sponsorIso,
            status: resolved.status,
            ...(resolved.clearApproved ? { approved_at: null } : {}),
            edited_at: new Date().toISOString(),
          })
          .eq("id", r.task.id);
        if (error) throw error;
        updated++;
      }
      toast.success(
        `Guardados ${updated} horario${updated === 1 ? "" : "s"}` +
          (clearedSponsor
            ? ` · ${clearedSponsor} entrega(s) al sponsor limpiada(s) (< ${STAND_SPONSOR_MIN_AFTER_CTW_MINUTES} min)`
            : "")
      );
      await load();
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Error al guardar horarios");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-task space-y-3">
      <div className="flex items-start gap-2">
        <CalendarClock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold">Horarios de stands (Pulpo → CTW)</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Ajusta la hora de entrega Pulpo → Colombia Tech de stands ya creados. El Excel Pulpo
            queda como referencia; puedes restaurarla o editar a mano y guardar.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Buscar marca o responsable…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 min-w-[10rem] h-9 rounded-xl border border-border bg-background px-3 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={loading || saving}
          onClick={() => void load()}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Recargar"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <button
          type="button"
          className="rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
          onClick={() => setSelected(new Set(filtered.map((r) => r.task.id)))}
        >
          Seleccionar visibles
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
          onClick={() => setSelected(new Set())}
        >
          Ninguno
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted inline-flex items-center gap-1"
          disabled={selected.size === 0}
          onClick={() => applyPulpoTo([...selected])}
        >
          <RotateCcw className="w-3 h-3" /> Usar hora Pulpo (sel.)
        </button>
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px]">
        {loading ? (
          <span className="text-muted-foreground">Cargando stands…</span>
        ) : (
          <span>
            <strong className="text-foreground">{rows.length}</strong> stands ·{" "}
            <strong className="text-foreground">{dirtyCount}</strong> con cambios sin guardar ·{" "}
            <strong className="text-foreground">{selected.size}</strong> seleccionados
          </span>
        )}
      </div>

      <ul className="max-h-80 overflow-y-auto space-y-2">
        {filtered.map((r) => {
          const id = r.task.id;
          const checked = selected.has(id);
          return (
            <li
              key={id}
              className={`rounded-xl border px-2.5 py-2 space-y-1.5 ${
                r.dirty ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-3.5 w-3.5 accent-primary shrink-0"
                  checked={checked}
                  onChange={() => toggle(id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">
                    {unifyBrand(r.task.marca)}
                    <span className="font-normal text-muted-foreground"> · {r.task.marca}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {r.task.responsable || "Sin responsable"} ·{" "}
                    {(r.task.tipo_beneficio || "").slice(0, 48)}
                  </div>
                </div>
                {r.differsFromPulpo && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 shrink-0">
                    ≠ Pulpo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end pl-5">
                <label className="block space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Pulpo → CTW (editable)
                  </span>
                  <input
                    type="datetime-local"
                    step={STAND_DATETIME_STEP_SECONDS}
                    value={r.draft.ctwLocal}
                    onChange={(e) => setCtw(id, e.target.value)}
                    className="w-full h-9 rounded-lg border border-input bg-background px-2 text-xs"
                  />
                </label>
                <button
                  type="button"
                  className="h-9 px-2 rounded-lg border border-border text-[10px] font-semibold hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1"
                  disabled={!r.pulpo}
                  onClick={() => applyPulpoTo([id])}
                  title={r.pulpo ? `Pulpo: ${r.pulpo.label}` : "Sin match Pulpo"}
                >
                  <RotateCcw className="w-3 h-3" /> Pulpo
                </button>
              </div>

              <div className="pl-5 text-[10px] text-muted-foreground space-y-0.5">
                <div>
                  Guardado:{" "}
                  <span className="text-foreground font-medium">
                    {formatEntregaBogota(r.task.entrega_ctw_at) || "—"}
                  </span>
                  {r.pulpo && (
                    <>
                      {" · "}Pulpo:{" "}
                      <span className="text-foreground font-medium">{r.pulpo.label}</span>
                    </>
                  )}
                </div>
                <div>
                  Entrega sponsor:{" "}
                  <span className="text-foreground font-medium">
                    {formatEntregaBogota(r.task.entrega_sponsor_at) || "—"}
                  </span>
                  {r.task.entrega_sponsor_at && r.dirty && !r.sponsorOk && (
                    <span className="text-destructive font-semibold">
                      {" "}
                      · se limpiará al guardar (&lt; {STAND_SPONSOR_MIN_AFTER_CTW_MINUTES} min)
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {!loading && filtered.length === 0 && (
          <li className="text-[11px] text-muted-foreground text-center py-4">
            No hay stands{q ? " con ese filtro" : ""}.
          </li>
        )}
      </ul>

      <Button
        className="w-full"
        disabled={saving || dirtyCount === 0}
        onClick={() => void save()}
      >
        {saving ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <CalendarClock className="w-4 h-4 mr-1" />
        )}
        Guardar horarios ({dirtyCount})
      </Button>
    </div>
  );
}
