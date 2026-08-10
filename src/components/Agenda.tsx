import { useMemo, useState } from "react";
import { useTasks, STATUS, type Task } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { useEvent } from "@/context/EventContext";
import { cn } from "@/lib/utils";
import { isStandRecepcion, standSlotKey } from "@/lib/standRecepcion";
import { resolveEntregaCtwIso } from "@/lib/applyPulpoCronograma";
import { unifyBrand } from "@/lib/brands";
import {
  daysBetween,
  formatDayLabel,
  formatDayParts,
  hasRealAgendaTime,
  normalizeDayKey,
  padHora,
} from "@/lib/calendarSlots";

interface Props {
  responsable: string;
  uploaderName: string;
}

type SlotKind = "timed" | "stand_ctw" | "stand_sponsor";
type DayFilter = "all" | string;

type AgendaSlot = {
  key: string;
  task: Task;
  kind: SlotKind;
  dayKey: string;
  timeLabel: string;
  sortKey: string;
  badgeExtra?: string;
};

function hasRealTime(t: Task) {
  return hasRealAgendaTime(t);
}

function slotFromStandIso(
  task: Task,
  iso: string,
  kind: "stand_ctw" | "stand_sponsor"
): AgendaSlot | null {
  const slot = standSlotKey(iso);
  if (!slot) return null;
  const [dayKey, timeLabel] = slot.split(" ");
  if (!dayKey || !timeLabel) return null;
  const badgeExtra =
    kind === "stand_ctw" ? "Pulpo → CTW" : `CTW → ${unifyBrand(task.marca)}`;
  return {
    key: `${task.id}:${kind}`,
    task,
    kind,
    dayKey,
    timeLabel,
    sortKey: `${dayKey}|${timeLabel}|${kind === "stand_ctw" ? "0" : "1"}|${task.marca}`,
    badgeExtra,
  };
}

function buildSlots(
  tasks: Task[],
  eventStart: string | null
): { slots: AgendaSlot[]; sinHora: Task[] } {
  const slots: AgendaSlot[] = [];
  const timedOrStandIds = new Set<string>();

  for (const t of tasks) {
    if (isStandRecepcion(t)) {
      const ctwIso = resolveEntregaCtwIso(t);
      const ctw = ctwIso ? slotFromStandIso(t, ctwIso, "stand_ctw") : null;
      const sponsor = t.entrega_sponsor_at
        ? slotFromStandIso(t, t.entrega_sponsor_at, "stand_sponsor")
        : null;
      if (ctw) {
        slots.push(ctw);
        timedOrStandIds.add(t.id);
      }
      if (sponsor) {
        slots.push(sponsor);
        timedOrStandIds.add(t.id);
      }
      continue;
    }

    if (hasRealTime(t)) {
      const dayKey = normalizeDayKey(t.dia, eventStart);
      const timeLabel = padHora(t.hora!);
      slots.push({
        key: t.id,
        task: t,
        kind: "timed",
        dayKey,
        timeLabel,
        sortKey: `${dayKey}|${timeLabel}|2|${t.marca}`,
      });
      timedOrStandIds.add(t.id);
    }
  }

  slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const sinHora = tasks
    .filter((t) => !timedOrStandIds.has(t.id))
    .slice()
    .sort((a, b) => (a.marca || "").localeCompare(b.marca || "", "es"));

  return { slots, sinHora };
}

export const Agenda = ({ responsable, uploaderName }: Props) => {
  const { tasks, loading } = useTasks(responsable);
  const { event } = useEvent();
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");

  const { allSlots, sinHora, completed, total } = useMemo(() => {
    const { slots, sinHora } = buildSlots(tasks, event?.starts_on ?? null);
    const completed = tasks.filter(
      (t) => t.status === STATUS.REVIEW || t.status === STATUS.APPROVED
    ).length;
    return { allSlots: slots, sinHora, completed, total: tasks.length };
  }, [tasks, event?.starts_on]);

  const eventDayKeys = useMemo(() => {
    if (event?.starts_on && event?.ends_on) {
      return daysBetween(event.starts_on, event.ends_on);
    }
    return [];
  }, [event?.starts_on, event?.ends_on]);

  const dayKeysWithSlots = useMemo(() => {
    const fromSlots = [
      ...new Set(
        allSlots.map((s) => s.dayKey).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) || k.startsWith("9999-"))
      ),
    ].sort();
    const realDays = fromSlots.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    const otherDays = fromSlots.filter((k) => !/^\d{4}-\d{2}-\d{2}$/.test(k));
    const merged = new Set([...eventDayKeys, ...realDays]);
    return [...Array.from(merged).sort(), ...otherDays];
  }, [allSlots, eventDayKeys]);

  const countsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of allSlots) {
      map[s.dayKey] = (map[s.dayKey] || 0) + 1;
    }
    return map;
  }, [allSlots]);

  const filteredSlots = useMemo(() => {
    if (dayFilter === "all") return allSlots;
    return allSlots.filter((s) => s.dayKey === dayFilter);
  }, [allSlots, dayFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaSlot[]>();
    for (const s of filteredSlots) {
      if (!map.has(s.dayKey)) map.set(s.dayKey, []);
      map.get(s.dayKey)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSlots]);

  const showSinHora = dayFilter === "all" && sinHora.length > 0;

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Cargando agenda…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        No hay tareas en tu agenda.
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="card-task !p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-semibold text-muted-foreground">
            Agenda con horario
          </span>
          <span className="text-sm font-bold">
            {completed} / {total}
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full gradient-primary transition-all"
            style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
          Incluye horarios de agenda y entregas de stands (Pulpo → CTW y luego a cada proveedor),
          ordenados por fecha y hora. Filtra por día abajo.
        </p>
      </div>

      {/* Fichas de día — mismo patrón que Calendario coordinador */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-2 max-w-full">
          <DayPill
            active={dayFilter === "all"}
            weekday="Todos"
            dateLabel={null}
            count={allSlots.length}
            onClick={() => setDayFilter("all")}
          />
          {dayKeysWithSlots.map((d) => {
            const parts = formatDayParts(d);
            return (
              <DayPill
                key={d}
                active={dayFilter === d}
                weekday={parts.weekday}
                dateLabel={parts.date || null}
                count={countsByDay[d] || 0}
                onClick={() => setDayFilter(d)}
              />
            );
          })}
        </div>
      </div>

      {byDay.length === 0 && (
        <p className="text-sm text-muted-foreground px-1 text-center">
          {allSlots.length === 0
            ? "No tienes beneficios con hora fija. Usa la pestaña Sponsors para verlos todos."
            : "No hay eventos en este día."}
        </p>
      )}

      {byDay.map(([dayKey, items]) => (
        <section key={dayKey} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-sm font-bold capitalize tracking-tight text-foreground">
              {formatDayLabel(dayKey)}
            </h2>
            <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
              {items.length} evento{items.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="relative space-y-3">
            <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
            {items.map((slot) => (
              <div key={slot.key} className="relative pl-9">
                <div
                  className={cn(
                    "absolute left-3 top-4 w-2.5 h-2.5 rounded-full ring-4 ring-background",
                    slot.kind === "stand_ctw"
                      ? "bg-amber-500"
                      : slot.kind === "stand_sponsor"
                        ? "bg-emerald-500"
                        : "bg-primary"
                  )}
                />
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex text-[11px] font-bold px-2 py-0.5 rounded-md",
                      slot.kind === "stand_ctw"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : slot.kind === "stand_sponsor"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-primary/15 text-primary"
                    )}
                  >
                    {slot.timeLabel}
                  </span>
                  {slot.badgeExtra && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {slot.badgeExtra}
                    </span>
                  )}
                </div>
                <TaskCard task={slot.task} uploaderName={uploaderName} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {showSinHora && (
        <section>
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2 px-1">
            Sin horario fijo ({sinHora.length})
          </h2>
          <p className="text-xs text-muted-foreground px-1 mb-3">
            Captúralos cuando puedas — también aparecen agrupados por sponsor. Los stands sin
            horarios de entrega aparecen aquí hasta que se agenden.
          </p>
          <div className="space-y-3">
            {sinHora.map((t) => (
              <TaskCard key={t.id} task={t} uploaderName={uploaderName} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

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
