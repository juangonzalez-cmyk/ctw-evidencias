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

export function isStandRecepcion(task: {
  flujo?: string | null;
  tipo_beneficio?: string | null;
  category?: string | null;
}): boolean {
  if (task.flujo === FLUJO_STAND_RECEPCION) return true;
  const tipo = (task.tipo_beneficio || "").toLowerCase();
  const cat = (task.category || "").toLowerCase();
  return tipo.includes("stand") || cat.includes("stand");
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

/**
 * Al editar un stand, no bajar de `aprobada` si sigue completo.
 * Solo vuelve a pendiente/por_validar si faltan requisitos o no estaba aprobado.
 */
export function resolveStandStatusAfterEdit(
  currentStatus: string | null | undefined,
  evidence: Pick<
    TaskLike,
    "evidencia_url" | "acta_recepcion_url" | "entrega_ctw_at" | "entrega_sponsor_at"
  >
): { status: string; clearApproved: boolean } {
  const progress = statusForStandProgress(evidence);
  if (currentStatus === "aprobada" && progress === "por_validar") {
    return { status: "aprobada", clearApproved: false };
  }
  return { status: progress, clearApproved: progress === "pendiente" };
}

/** Intervalo de slots para entrega al sponsor (minutos). Pulpo usa 10/20 min. */
export const STAND_SLOT_MINUTES = 10;
/** La entrega al sponsor no puede ser antes de CTW + este margen (minutos). */
export const STAND_SPONSOR_MIN_AFTER_CTW_MINUTES = 59;
/** step de `<input type="datetime-local">` en segundos */
export const STAND_DATETIME_STEP_SECONDS = STAND_SLOT_MINUTES * 60;

/** Colombia no tiene DST: UTC−5 fijo. */
export function bogotaLocalToIso(dateYmd: string, timeHm: string): string {
  const dm = dateYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const tm = timeHm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!dm || !tm) throw new Error(`Fecha/hora Bogotá inválida: ${dateYmd} ${timeHm}`);
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  const utcMs = Date.UTC(y, mo - 1, d, hh + 5, mm, 0, 0);
  return new Date(utcMs).toISOString();
}

/** datetime-local value from timestamptz ISO, siempre en hora Colombia (America/Bogota). */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  const key = standSlotKey(iso);
  if (!key) return "";
  const [date, time] = key.split(" ");
  if (!date || !time) return "";
  return `${date}T${time}`;
}

/** Redondea un valor datetime-local al slot de STAND_SLOT_MINUTES más cercano. */
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
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    // Mantener día calendario Bogotá del input (sin Date local del browser).
    let day = dayNum;
    let month = mo;
    let year = y;
    let carryH = hh;
    if (carryH >= 24) {
      // raro; no cruzamos día aquí de forma compleja — clamp
      carryH = 23;
    }
    return `${year}-${pad(month)}-${pad(day)}T${pad(carryH)}:${pad(mm)}`;
  }
  return v;
}

/** Parse datetime-local como hora Bogotá → ISO timestamptz. */
export function fromDatetimeLocalValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (!m) return null;
  try {
    return bogotaLocalToIso(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}:${m[5]}`);
  } catch {
    return null;
  }
}

/** True si sponsor está ≥ margen mínimo después de Pulpo→CTW. */
export function isSponsorMinGapMet(
  entregaCtwAt: string | null | undefined,
  entregaSponsorAt: string | null | undefined
): boolean {
  if (!entregaCtwAt || !entregaSponsorAt) return false;
  const ctw = new Date(entregaCtwAt).getTime();
  const sp = new Date(entregaSponsorAt).getTime();
  if (Number.isNaN(ctw) || Number.isNaN(sp)) return false;
  return sp - ctw >= STAND_SPONSOR_MIN_AFTER_CTW_MINUTES * 60_000;
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
    throw new Error(
      `${label}: solo se permiten horarios cada ${STAND_SLOT_MINUTES} minutos (ej. 10:00 o 10:${String(STAND_SLOT_MINUTES).padStart(2, "0")}).`
    );
  }
}

/** Entrega al sponsor ≥ CTW + STAND_SPONSOR_MIN_AFTER_CTW_MINUTES. */
export function assertSponsorAfterCtw(
  entregaCtwAt: string | null | undefined,
  entregaSponsorAt: string | null | undefined
) {
  if (!entregaCtwAt || !entregaSponsorAt) return;
  if (!isSponsorMinGapMet(entregaCtwAt, entregaSponsorAt)) {
    throw new Error(
      `La entrega al sponsor debe ser al menos ${STAND_SPONSOR_MIN_AFTER_CTW_MINUTES} min después de Pulpo → CTW (${formatEntregaBogota(entregaCtwAt)}).`
    );
  }
}

export type StandEntregaConflict = {
  field: "entrega_sponsor_at";
  label: string;
  otherMarca: string;
  otherTipo: string;
  slotKey: string;
};

/**
 * Solo las entregas CTW→sponsor deben ser exclusivas.
 * Pulpo puede entregar varios stands a la misma hora (cronograma).
 */
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
  const sponsorKey = standSlotKey(opts.entregaSponsorAt);
  if (!sponsorKey) return null;

  for (const other of opts.others) {
    if (other.id === opts.currentTaskId || other.deleted_at) continue;
    const otherSponsor = standSlotKey(other.entrega_sponsor_at);
    if (otherSponsor && sponsorKey === otherSponsor) {
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
  return `${c.label} ${c.slotKey} ya está asignada a ${c.otherMarca} (${c.otherTipo}). Elige otro horario.`;
}

export function formatEntregaBogota(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Mínimo datetime-local (Bogotá) para entrega al sponsor = CTW + 59 min exactos (sin redondear a 60). */
export function minSponsorDatetimeLocal(ctwIso: string | null | undefined): string {
  if (!ctwIso) return "";
  const t = new Date(ctwIso).getTime();
  if (Number.isNaN(t)) return "";
  const minIso = new Date(t + STAND_SPONSOR_MIN_AFTER_CTW_MINUTES * 60_000).toISOString();
  return toDatetimeLocalValue(minIso);
}
