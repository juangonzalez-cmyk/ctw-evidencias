import type { Tables } from "@/integrations/supabase/types";
import { FASES, FASE_LABEL, getFase, type Fase } from "@/lib/fases";
import { listEvidencias } from "@/lib/evidencias";
import { isStandRecepcion } from "@/lib/standRecepcion";
import { isMillaExtra } from "@/lib/tipoEntrega";
import { displayBeneficioLabel } from "@/lib/beneficioLabel";

export type Task = Tables<"tasks">;

export function taskHasEvidence(t: Task): boolean {
  return (
    listEvidencias(t).length > 0 ||
    !!t.evidencia_url ||
    (isStandRecepcion(t) && !!t.acta_recepcion_url)
  );
}

export function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso.includes("T") ? iso : `${iso}T12:00:00`).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Bogota",
    });
  } catch {
    return iso;
  }
}

export function formatReportDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    });
  } catch {
    return iso;
  }
}

export function buildThankYouIntro(opts: {
  sponsorName: string;
  eventName: string;
  startsOn?: string | null;
  endsOn?: string | null;
  withEvidenceCount: number;
}): { headline: string; body: string; closing: string } {
  const range =
    opts.startsOn && opts.endsOn && opts.startsOn !== opts.endsOn
      ? `${formatReportDate(opts.startsOn)} – ${formatReportDate(opts.endsOn)}`
      : formatReportDate(opts.startsOn || opts.endsOn) || opts.eventName;

  const headline = `Este es el informe de cierre de ${opts.eventName} · ${opts.sponsorName}${
    range ? `, realizado ${range.startsWith("el ") || range.includes("–") ? range : `el ${range}` : ""}`
  }.`;

  const body =
    opts.withEvidenceCount > 0
      ? `Incluye ${opts.withEvidenceCount} evidencia${opts.withEvidenceCount === 1 ? "" : "s"} de los beneficios entregados durante el evento.`
      : `Estamos consolidando las evidencias de tus beneficios. Este informe se actualizará a medida que avancemos.`;

  const closing = `Gracias, equipo ${opts.sponsorName}, por hacer este sueño posible. Gracias por unirse al objetivo de seguir poniendo a Colombia en el mapa.`;

  return { headline, body, closing };
}

export function lastEvidenceAt(tasks: Task[]): string | null {
  let best: string | null = null;
  for (const t of tasks) {
    const candidates = [
      t.hora_subida,
      t.approved_at,
      t.edited_at,
      t.updated_at,
      ...listEvidencias(t).map((e) => e.added_at || null),
    ];
    for (const c of candidates) {
      if (c && (!best || c > best)) best = c;
    }
  }
  return best;
}

export type ReportBuckets = {
  active: Task[];
  withEvidence: Task[];
  pending: Task[];
  contractual: Task[];
  millaExtra: Task[];
  millaExtraWithEvidence: Task[];
  contractualWithEvidence: Task[];
  byFaseContractual: Record<Fase, Task[]>;
  phasesCovered: Fase[];
};

export function buildReportBuckets(tasks: Task[]): ReportBuckets {
  const active = tasks.filter((t) => !t.deleted_at && t.status !== "rechazado");
  const withEvidence = active.filter(taskHasEvidence);
  const pending = active.filter((t) => !taskHasEvidence(t));
  const contractual = active.filter((t) => !isMillaExtra(t));
  const millaExtra = active.filter((t) => isMillaExtra(t));
  const contractualWithEvidence = contractual.filter(taskHasEvidence);
  const millaExtraWithEvidence = millaExtra.filter(taskHasEvidence);

  const byFaseContractual: Record<Fase, Task[]> = {
    pre_evento: [],
    durante_evento: [],
    post_evento: [],
  };
  for (const t of contractualWithEvidence) {
    byFaseContractual[getFase(t)].push(t);
  }

  const phasesCovered = FASES.filter((f) => byFaseContractual[f].length > 0);

  return {
    active,
    withEvidence,
    pending,
    contractual,
    millaExtra,
    millaExtraWithEvidence,
    contractualWithEvidence,
    byFaseContractual,
    phasesCovered,
  };
}

export function benefitTitle(t: Task): string {
  return displayBeneficioLabel(t.tipo_beneficio);
}

export { FASES, FASE_LABEL };
