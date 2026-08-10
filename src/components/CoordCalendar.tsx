import { useMemo, useState } from "react";
import { useAllTasks, STATUS } from "@/hooks/useTasks";
import { useEvent } from "@/context/EventContext";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayBeneficioLabel } from "@/lib/beneficioLabel";
import {
  SLOT_KIND_META,
  buildCalendarSlots,
  daysBetween,
  formatDayLabel,
  formatDayParts,
  groupSlotsByDay,
  slotEvidenceDone,
  type CalendarSlot,
  type CalendarSlotKind,
} from "@/lib/calendarSlots";

type KindFilter = "all" | CalendarSlotKind;
type DayFilter = "all" | string;

/** Radio y borde unificados en toda la vista. */
const PANEL = "rounded-2xl border border-border bg-card";
const CONTROL =
  "h-11 rounded-2xl border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

/**
 * Vista coordinador: calendario operativo de entregas Pulpo/CTW/sponsor
 * y capturas de beneficios con hora.
 */
export function CoordCalendar() {
  const { tasks, loading } = useAllTasks();
  const { event } = useEvent();

  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const active = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks]);

  const allSlots = useMemo(
    () => buildCalendarSlots(active, event?.starts_on ?? null),
    [active, event?.starts_on]
  );

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSlots) {
      if (s.task?.responsable) set.add(s.task.responsable);
      else if (s.planMeta?.quienEntrega) set.add(s.planMeta.quienEntrega);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [allSlots]);

  const eventDayKeys = useMemo(() => {
    if (event?.starts_on && event?.ends_on) {
      return daysBetween(event.starts_on, event.ends_on);
    }
    return [];
  }, [event?.starts_on, event?.ends_on]);

  const dayKeysWithSlots = useMemo(() => {
    const fromSlots = [
      ...new Set(allSlots.map((s) => s.dayKey).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))),
    ].sort();
    const merged = new Set([...eventDayKeys, ...fromSlots]);
    return Array.from(merged).sort();
  }, [allSlots, eventDayKeys]);

  const filteredSlots = useMemo(() => {
    return allSlots.filter((s) => {
      if (kindFilter !== "all" && s.kind !== kindFilter) return false;
      if (ownerFilter !== "all") {
        const owner = s.task?.responsable || s.planMeta?.quienEntrega || "";
        if (owner !== ownerFilter) return false;
      }
      if (dayFilter !== "all" && s.dayKey !== dayFilter) return false;
      return true;
    });
  }, [allSlots, kindFilter, ownerFilter, dayFilter]);

  const byDay = useMemo(() => groupSlotsByDay(filteredSlots), [filteredSlots]);

  const stats = useMemo(() => {
    const pulpo = allSlots.filter((s) => s.kind === "stand_ctw").length;
    const sponsor = allSlots.filter((s) => s.kind === "stand_sponsor").length;
    const captura = allSlots.filter((s) => s.kind === "timed").length;
    const planned = allSlots.filter((s) => s.fromPlan).length;
    const done = filteredSlots.filter(slotEvidenceDone).length;
    return {
      total: allSlots.length,
      pulpo,
      sponsor,
      captura,
      planned,
      done,
      shown: filteredSlots.length,
    };
  }, [allSlots, filteredSlots]);

  const countsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of allSlots) {
      if (kindFilter !== "all" && s.kind !== kindFilter) continue;
      if (ownerFilter !== "all") {
        const owner = s.task?.responsable || s.planMeta?.quienEntrega || "";
        if (owner !== ownerFilter) continue;
      }
      map[s.dayKey] = (map[s.dayKey] || 0) + 1;
    }
    return map;
  }, [allSlots, kindFilter, ownerFilter]);

  if (loading) {
    return (
      <div className="py-16 flex justify-center text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando calendario…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* —— Vista general (sin cambios de estructura) —— */}
      <div className="card-task !p-4 space-y-3">
        <div>
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Vista general
          </div>
          <h2 className="text-lg font-bold mt-0.5">Calendario operativo</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Incluye el cronograma Pulpo (11–12 ago) aunque aún no esté guardado en cada stand, más
            entregas al sponsor y capturas con hora.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip label="Total slots" value={stats.total} />
          <StatChip label="Pulpo → CTW" value={stats.pulpo} tone="amber" />
          <StatChip label="CTW → sponsor" value={stats.sponsor} tone="emerald" />
          <StatChip label="Capturas" value={stats.captura} tone="primary" />
        </div>

        {stats.planned > 0 && (
          <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 leading-snug">
            {stats.planned} entrega{stats.planned === 1 ? "" : "s"} Pulpo vienen del Excel (aún no
            guardadas en el beneficio). En Admin → Cronograma Pulpo puedes aplicarlas a los stands.
          </p>
        )}

        <div className="flex flex-wrap gap-2 text-[10px]">
          {(Object.keys(SLOT_KIND_META) as CalendarSlotKind[]).map((k) => (
            <span
              key={k}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold",
                SLOT_KIND_META[k].className
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", SLOT_KIND_META[k].dot)} />
              {k === "stand_ctw"
                ? "Pulpo → CTW"
                : k === "stand_sponsor"
                  ? "CTW → sponsor"
                  : "Captura / agenda"}
            </span>
          ))}
        </div>
      </div>

      {/* —— Días centrados —— */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-2 max-w-full">
          <DayPill
            active={dayFilter === "all"}
            weekday="Todos"
            dateLabel={null}
            count={stats.shown}
            onClick={() => setDayFilter("all")}
          />
          {dayKeysWithSlots.map((d) => {
            const parts = formatDayParts(d);
            return (
              <DayPill
                key={d}
                active={dayFilter === d}
                weekday={parts.weekday}
                dateLabel={parts.date}
                count={countsByDay[d] || 0}
                onClick={() => setDayFilter(d)}
              />
            );
          })}
        </div>
      </div>

      {/* —— Filtros centrados —— */}
      <div className="flex justify-center">
        <div className="grid grid-cols-2 gap-2 w-full max-w-md">
          <select
            className={CONTROL}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            aria-label="Filtrar por tipo"
          >
            <option value="all">Tipo: todos</option>
            <option value="stand_ctw">Pulpo → CTW</option>
            <option value="stand_sponsor">CTW → sponsor</option>
            <option value="timed">Captura / agenda</option>
          </select>
          <select
            className={CONTROL}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            aria-label="Filtrar por responsable"
          >
            <option value="all">Responsable: todos</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* —— Timeline —— */}
      {byDay.length === 0 ? (
        <div className={cn(PANEL, "py-14 text-center text-sm text-muted-foreground")}>
          No hay eventos con estos filtros.
          <p className="text-xs mt-2 px-6 text-muted-foreground/80">
            Aparecen aquí beneficios con hora de agenda y stands con horarios de entrega.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {byDay.map(([dayKey, items]) => (
            <section key={dayKey} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <h3 className="text-sm font-bold capitalize tracking-tight text-foreground">
                  {formatDayLabel(dayKey)}
                </h3>
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                  {items.length} evento{items.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="relative">
                {/* Línea vertical alineada al centro de la columna de hora */}
                <div
                  className="absolute top-2 bottom-2 w-px bg-border/80 pointer-events-none"
                  style={{ left: "1.625rem" }}
                  aria-hidden
                />
                <ul className="relative space-y-2.5">
                  {items.map((slot) => (
                    <li key={slot.key}>
                      <SlotRow slot={slot} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "emerald" | "primary";
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase font-bold text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xl font-extrabold mt-0.5 tabular-nums",
          tone === "amber" && "text-amber-700 dark:text-amber-400",
          tone === "emerald" && "text-emerald-700 dark:text-emerald-400",
          tone === "primary" && "text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DayPill({
  active,
  weekday,
  dateLabel,
  count,
  onClick,
}: {
  active: boolean;
  weekday: string;
  dateLabel: string | null;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 min-w-[5.75rem] rounded-2xl border px-3 py-2.5 text-center transition-colors shadow-sm",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border text-foreground hover:bg-muted/60"
      )}
    >
      <div className="text-[11px] font-bold capitalize leading-tight whitespace-nowrap">
        {weekday}
      </div>
      {dateLabel ? (
        <div
          className={cn(
            "text-[11px] font-semibold mt-0.5 whitespace-nowrap capitalize",
            active ? "text-primary-foreground/90" : "text-foreground/90"
          )}
        >
          {dateLabel}
        </div>
      ) : null}
      <div
        className={cn(
          "text-[10px] mt-1 tabular-nums",
          active ? "text-primary-foreground/75" : "text-muted-foreground"
        )}
      >
        {count} evento{count === 1 ? "" : "s"}
      </div>
    </button>
  );
}

function SlotRow({ slot }: { slot: CalendarSlot }) {
  const meta = SLOT_KIND_META[slot.kind];
  const done = slotEvidenceDone(slot);
  const approved = slot.task?.status === STATUS.APPROVED;
  const beneficio =
    slot.task?.tipo_beneficio != null
      ? displayBeneficioLabel(slot.task.tipo_beneficio)
      : slot.planMeta
        ? [slot.planMeta.standNo ? `#${slot.planMeta.standNo}` : null, slot.planMeta.tamaño]
            .filter(Boolean)
            .join(" · ")
        : "—";
  const owner =
    slot.task?.responsable || slot.planMeta?.quienEntrega || "Sin responsable";

  const statusLabel = approved
    ? "Aprobada"
    : done
      ? "Por validar"
      : slot.fromPlan
        ? "Planificado"
        : "Pendiente";

  const statusClass = approved
    ? "text-success"
    : done
      ? "text-amber-600 dark:text-amber-400"
      : slot.fromPlan
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2.5 items-stretch">
      {/* Columna hora + punto */}
      <div className="relative flex flex-col items-center pt-3">
        <span
          className={cn(
            "relative z-[1] w-2.5 h-2.5 rounded-full ring-[3px] ring-background shrink-0",
            meta.dot
          )}
        />
        <span className="mt-1.5 text-[11px] font-bold tabular-nums text-foreground leading-none">
          {slot.timeLabel}
        </span>
      </div>

      {/* Tarjeta de contenido — mismo radio que filtros/días */}
      <div className={cn(PANEL, "px-3.5 py-3 shadow-sm")}>
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span
            className={cn(
              "inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border",
              meta.className
            )}
          >
            {slot.label}
          </span>
          {slot.fromPlan && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25">
              Plan Excel
            </span>
          )}
        </div>

        <div className="text-sm font-bold leading-snug truncate">{slot.sponsor}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {beneficio}
        </div>
        {slot.planMeta?.observacion && (
          <div className="text-[10px] text-muted-foreground/90 mt-1 line-clamp-1">
            {slot.planMeta.observacion}
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground truncate min-w-0">{owner}</span>
          <span className={cn("font-bold uppercase tracking-wide shrink-0", statusClass)}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
