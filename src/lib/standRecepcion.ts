import type { Tables } from "@/integrations/supabase/types";

export type TaskLike = Pick<
  Tables<"tasks">,
  | "flujo"
  | "evidencia_url"
  | "acta_recepcion_url"
  | "entrega_ctw_at"
  | "entrega_sponsor_at"
  | "rejected_at"
  | "status"
>;

export const FLUJO_SIMPLE = "simple";
export const FLUJO_STAND_RECEPCION = "stand_recepcion";

/** Texto fijo que acepta el sponsor al firmar el acta. */
export const STAND_ACEPTACION_TEXT =
  "Acepto la recepción del stand de acuerdo a lo establecido.";

export function isStandRecepcion(task: { flujo?: string | null }): boolean {
  return task.flujo === FLUJO_STAND_RECEPCION;
}

export function hasPhotoEvidence(task: { evidencia_url?: string | null }): boolean {
  return !!(task.evidencia_url && task.evidencia_url.trim());
}

export function hasActaRecepcion(task: { acta_recepcion_url?: string | null }): boolean {
  return !!(task.acta_recepcion_url && task.acta_recepcion_url.trim());
}

/** Completo para pasar a por_validar / contar como entregado (stands). */
export function isStandRecepcionComplete(
  task: Pick<
    TaskLike,
    "evidencia_url" | "acta_recepcion_url" | "entrega_ctw_at" | "entrega_sponsor_at"
  >
): boolean {
  return (
    hasPhotoEvidence(task) &&
    hasActaRecepcion(task) &&
    !!task.entrega_ctw_at &&
    !!task.entrega_sponsor_at
  );
}

/** Criterio unificado: simple = foto/doc; stand = dual + fechas. */
export function hasRequiredEvidence(
  task: Pick<
    TaskLike,
    | "flujo"
    | "evidencia_url"
    | "acta_recepcion_url"
    | "entrega_ctw_at"
    | "entrega_sponsor_at"
    | "rejected_at"
  >
): boolean {
  if (task.rejected_at) return false;
  if (isStandRecepcion(task)) return isStandRecepcionComplete(task);
  return hasPhotoEvidence(task);
}

export function statusForStandProgress(
  task: Pick<
    TaskLike,
    "evidencia_url" | "acta_recepcion_url" | "entrega_ctw_at" | "entrega_sponsor_at"
  >
): "pendiente" | "por_validar" {
  return isStandRecepcionComplete(task) ? "por_validar" : "pendiente";
}

/** Intervalo fijo de slots de entrega de stands (minutos). */
export const STAND_SLOT_MINUTES = 30;
/** step de `<input type="datetime-local">` en segundos */
export const STAND_DATETIME_STEP_SECONDS = STAND_SLOT_MINUTES * 60;

/** datetime-local value from timestamptz ISO (local browser). */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Redondea un valor datetime-local al slot de 30 minutos más cercano. */
export function snapDatetimeLocalToHalfHour(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const dayNum = Number(m[3]);
    let total = Number(m[4]) * 60 + Number(m[5]);
    total = Math.round(total / STAND_SLOT_MINUTES) * STAND_SLOT_MINUTES;
    const d = new Date(y, mo - 1, dayNum, 0, 0, 0, 0);
    d.setMinutes(total);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const totalMins = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.round(totalMins / STAND_SLOT_MINUTES) * STAND_SLOT_MINUTES;
  d.setHours(0, 0, 0, 0);
  d.setMinutes(rounded);
  return toDatetimeLocalValue(d.toISOString());
}

/** Parse datetime-local to ISO timestamptz (segundos en 0). */
export function fromDatetimeLocalValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  d.setSeconds(0, 0);
  return d.toISOString();
}

/** Clave de slot en hora Colombia (YYYY-MM-DD HH:mm) para comparar choques. */
export function standSlotKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function isHalfHourStandSlot(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const key = standSlotKey(iso);
  if (!key) return false;
  const minute = Number(key.slice(-2));
  return minute % STAND_SLOT_MINUTES === 0;
}

export function assertHalfHourStandSlot(iso: string | null | undefined, label: string) {
  if (!iso) return;
  if (!isHalfHourStandSlot(iso)) {
    throw new Error(`${label}: solo se permiten horarios cada 30 minutos (ej. 10:00 o 10:30).`);
  }
}

export type StandEntregaConflict = {
  field: "entrega_ctw_at" | "entrega_sponsor_at";
  label: string;
  otherMarca: string;
  otherTipo: string;
  slotKey: string;
};

export function findStandEntregaConflicts(opts: {
  currentTaskId: string;
  entregaCtwAt: string | null;
  entregaSponsorAt: string | null;
  others: Array<{
    id: string;
    marca: string;
    tipo_beneficio: string;
    entrega_ctw_at: string | null;
    entrega_sponsor_at: string | null;
    deleted_at?: string | null;
  }>;
}): StandEntregaConflict | null {
  const ctwKey = standSlotKey(opts.entregaCtwAt);
  const sponsorKey = standSlotKey(opts.entregaSponsorAt);

  for (const other of opts.others) {
    if (other.id === opts.currentTaskId || other.deleted_at) continue;
    const otherCtw = standSlotKey(other.entrega_ctw_at);
    const otherSponsor = standSlotKey(other.entrega_sponsor_at);

    if (ctwKey && otherCtw && ctwKey === otherCtw) {
      return {
        field: "entrega_ctw_at",
        label: "Entrega a Colombia Tech",
        otherMarca: other.marca,
        otherTipo: other.tipo_beneficio,
        slotKey: ctwKey,
      };
    }
    if (sponsorKey && otherSponsor && sponsorKey === otherSponsor) {
      return {
        field: "entrega_sponsor_at",
        label: "Entrega al sponsor",
        otherMarca: other.marca,
        otherTipo: other.tipo_beneficio,
        slotKey: sponsorKey,
      };
    }
  }
  return null;
}

export function formatStandConflictMessage(c: StandEntregaConflict): string {
  return `${c.label} ${c.slotKey} ya está asignada a ${c.otherMarca} (${c.otherTipo}). Elige otro horario (slots de 30 min).`;
}

export function formatEntregaBogota(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });
}
