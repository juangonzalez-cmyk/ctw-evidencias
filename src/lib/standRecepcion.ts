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

/** datetime-local value from timestamptz ISO (local browser). */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local to ISO timestamptz. */
export function fromDatetimeLocalValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatEntregaBogota(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });
}
