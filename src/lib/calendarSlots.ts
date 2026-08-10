import type { Tables } from "@/integrations/supabase/types";
import { isStandRecepcion, standSlotKey } from "@/lib/standRecepcion";
import { unifyBrand } from "@/lib/brands";
import { hasRequiredEvidence } from "@/lib/standRecepcion";
import { matchPulpoCronograma, type StandTaskRow } from "@/lib/applyPulpoCronograma";

export type Task = Tables<"tasks">;

export type CalendarSlotKind = "timed" | "stand_ctw" | "stand_sponsor";

export type CalendarSlot = {
  key: string;
  /** Null cuando es solo plan del Excel Pulpo (marca sin stand en DB). */
  task: Task | null;
  kind: CalendarSlotKind;
  dayKey: string;
  timeLabel: string;
  sortKey: string;
  label: string;
  sponsor: string;
  /** true = viene del cronograma documento; false/undefined = guardado en el beneficio. */
  fromPlan?: boolean;
  planMeta?: {
    quienEntrega: string | null;
    standNo: string | null;
    tamaño: string;
    observacion?: string;
  };
};

const MONTHS_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export function hasRealAgendaTime(t: Task) {
  return !!(
    t.is_timed &&
    t.hora &&
    !t.hora.toLowerCase().includes("confirmar") &&
    /^\d{1,2}:\d{2}/.test(t.hora.trim())
  );
}

export function padHora(hora: string): string {
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "99:99";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function yearFromEventStart(eventStart: string | null): number {
  if (eventStart && /^\d{4}/.test(eventStart)) return Number(eventStart.slice(0, 4));
  return new Date().getFullYear();
}

export function normalizeDayKey(dia: string | null | undefined, eventStart: string | null): string {
  const raw = (dia || "").trim();
  if (!raw) return "9999-99-99|sin-dia";

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const dayNum = raw.match(/d[ií]a\s*(\d+)/i);
  if (dayNum && eventStart && /^\d{4}-\d{2}-\d{2}/.test(eventStart)) {
    const base = new Date(eventStart.slice(0, 10) + "T12:00:00");
    if (!Number.isNaN(base.getTime())) {
      base.setDate(base.getDate() + (Number(dayNum[1]) - 1));
      const y = base.getFullYear();
      const m = String(base.getMonth() + 1).padStart(2, "0");
      const d = String(base.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // "13 de agosto" / "13 agosto"
  const named = raw.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)/i);
  if (named) {
    const month = MONTHS_ES[named[2].toLowerCase()];
    if (month) {
      const y = yearFromEventStart(eventStart);
      return `${y}-${String(month).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
    }
  }

  // Checklist Excel: "Jue 13 agosto", "Vie 14 ago", "Mié 12 de agosto"
  const abbrev = raw.match(
    /^(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-záéíóúñ]*\.?\s+(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)/i
  );
  if (abbrev) {
    const monthToken = abbrev[2].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const month =
      MONTHS_ES[abbrev[2].toLowerCase()] ||
      MONTHS_ES[monthToken] ||
      (monthToken.startsWith("ago") ? 8 : undefined);
    if (month) {
      const y = yearFromEventStart(eventStart);
      return `${y}-${String(month).padStart(2, "0")}-${String(Number(abbrev[1])).padStart(2, "0")}`;
    }
  }

  return `9999-98-00|${raw.toLowerCase()}`;
}

export function formatDayLabel(dayKey: string): string {
  if (dayKey.startsWith("9999-99")) return "Sin fecha";
  if (dayKey.startsWith("9999-98-00|")) return dayKey.slice("9999-98-00|".length);

  if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    try {
      return new Date(dayKey + "T12:00:00").toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      /* fall through */
    }
  }
  return dayKey;
}

export function formatDayShort(dayKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return formatDayLabel(dayKey);
  try {
    return new Date(dayKey + "T12:00:00").toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dayKey;
  }
}

/** Partes para fichas de día (weekday + fecha corta). */
export function formatDayParts(dayKey: string): { weekday: string; date: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return { weekday: formatDayLabel(dayKey), date: "" };
  }
  const d = new Date(dayKey + "T12:00:00");
  return {
    weekday: d.toLocaleDateString("es-CO", { weekday: "short" }).replace(/\.$/, ""),
    date: d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }),
  };
}

function slotFromStandIso(
  task: Task,
  iso: string,
  kind: "stand_ctw" | "stand_sponsor"
): CalendarSlot | null {
  const slot = standSlotKey(iso);
  if (!slot) return null;
  const [dayKey, timeLabel] = slot.split(" ");
  if (!dayKey || !timeLabel) return null;
  const sponsor = unifyBrand(task.marca);
  const label =
    kind === "stand_ctw" ? "Pulpo → CTW" : `CTW → ${sponsor}`;
  return {
    key: `${task.id}:${kind}`,
    task,
    kind,
    dayKey,
    timeLabel,
    sortKey: `${dayKey}|${timeLabel}|${kind === "stand_ctw" ? "0" : "1"}|${sponsor}`,
    label,
    sponsor,
  };
}

/**
 * Construye slots de calendario:
 * - Capturas con hora de agenda
 * - Entregas CTW→sponsor guardadas en stands
 * - Entregas Pulpo→CTW: prioriza `entrega_ctw_at` en DB; si no, usa el cronograma del Excel
 */
export function buildCalendarSlots(
  tasks: Task[],
  eventStart: string | null
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const standCtwFromDb = new Set<string>();

  for (const t of tasks) {
    if (t.deleted_at) continue;

    if (isStandRecepcion(t)) {
      if (t.entrega_ctw_at) {
        const s = slotFromStandIso(t, t.entrega_ctw_at, "stand_ctw");
        if (s) {
          slots.push(s);
          standCtwFromDb.add(t.id);
        }
      }
      if (t.entrega_sponsor_at) {
        const s = slotFromStandIso(t, t.entrega_sponsor_at, "stand_sponsor");
        if (s) slots.push(s);
      }
      continue;
    }

    if (hasRealAgendaTime(t)) {
      const dayKey = normalizeDayKey(t.dia, eventStart);
      const timeLabel = padHora(t.hora!);
      const sponsor = unifyBrand(t.marca);
      slots.push({
        key: t.id,
        task: t,
        kind: "timed",
        dayKey,
        timeLabel,
        sortKey: `${dayKey}|${timeLabel}|2|${sponsor}`,
        label: "Captura / agenda",
        sponsor,
      });
    }
  }

  // Cronograma Pulpo (documento): completar lo que aún no está en entrega_ctw_at
  const active = tasks.filter((t) => !t.deleted_at);
  const pulpoRows = matchPulpoCronograma(active as StandTaskRow[]);
  for (const row of pulpoRows) {
    if (row.task && standCtwFromDb.has(row.task.id)) continue;

    const slot = standSlotKey(row.iso);
    if (!slot) continue;
    const [dayKey, timeLabel] = slot.split(" ");
    if (!dayKey || !timeLabel) continue;

    const task = row.task
      ? (active.find((t) => t.id === row.task!.id) ?? null)
      : null;
    const sponsor = unifyBrand(task?.marca || row.brandHint || row.entrega.marca);

    slots.push({
      key: task
        ? `${task.id}:stand_ctw:plan`
        : `pulpo-plan:${row.entrega.fecha}:${row.entrega.hora}:${row.entrega.marca}`,
      task,
      kind: "stand_ctw",
      dayKey,
      timeLabel,
      sortKey: `${dayKey}|${timeLabel}|0|${sponsor}`,
      label: "Pulpo → CTW",
      sponsor,
      fromPlan: true,
      planMeta: {
        quienEntrega: row.entrega.quienEntrega,
        standNo: row.entrega.standNo,
        tamaño: row.entrega.tamaño,
        observacion: row.entrega.observacion,
      },
    });
  }

  slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return slots;
}

export function groupSlotsByDay(slots: CalendarSlot[]): [string, CalendarSlot[]][] {
  const map = new Map<string, CalendarSlot[]>();
  for (const s of slots) {
    if (!map.has(s.dayKey)) map.set(s.dayKey, []);
    map.get(s.dayKey)!.push(s);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return out;
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function slotEvidenceDone(slot: CalendarSlot): boolean {
  if (!slot.task) return false;
  return hasRequiredEvidence({ ...slot.task, rejected_at: slot.task.rejected_at });
}

export const SLOT_KIND_META: Record<
  CalendarSlotKind,
  { short: string; className: string; dot: string }
> = {
  stand_ctw: {
    short: "Pulpo",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
  },
  stand_sponsor: {
    short: "Sponsor",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  timed: {
    short: "Captura",
    className: "bg-primary/15 text-primary border-primary/30",
    dot: "bg-primary",
  },
};
