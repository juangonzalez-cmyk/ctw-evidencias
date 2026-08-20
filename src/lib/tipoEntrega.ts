import { displayBeneficioLabel } from "@/lib/beneficioLabel";

export type TipoEntrega = "contractual" | "adicional";

/** Contrato vs milla extra (Notion: Contrato / Adicional). */
export function isMillaExtra(task: {
  tipo_entrega?: string | null;
  tipo_beneficio?: string | null;
}): boolean {
  const te = (task.tipo_entrega || "").trim().toLowerCase();
  if (te === "adicional" || te === "milla_extra" || te === "extra") return true;
  if (te === "contractual" || te === "contrato") return false;
  return /^(adicional|upgrade|tailor\s*made)\s*[:\-–—]/i.test(task.tipo_beneficio || "");
}

export function resolveTipoEntrega(task: {
  tipo_entrega?: string | null;
  tipo_beneficio?: string | null;
}): TipoEntrega {
  return isMillaExtra(task) ? "adicional" : "contractual";
}

/** Prefija el nombre al crear/editar, sin duplicar prefijos. */
export function withTipoEntregaPrefix(tipo: string, entrega: TipoEntrega): string {
  const cleaned = displayBeneficioLabel(tipo).trim() || tipo.trim();
  if (entrega === "adicional") return `Adicional: ${cleaned}`;
  return `Contrato: ${cleaned}`;
}

export const TIPO_ENTREGA_LABEL: Record<TipoEntrega, string> = {
  contractual: "Por contrato",
  adicional: "La milla extra",
};
