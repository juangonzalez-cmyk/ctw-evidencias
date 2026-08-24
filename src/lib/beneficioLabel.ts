/**
 * Etiqueta limpia para UI: quita prefijos tipo "Contrato:" / "Adicional:"
 * sin alterar el valor guardado en BD.
 */
export function displayBeneficioLabel(tipo: string | null | undefined): string {
  if (!tipo) return "Beneficio";
  const cleaned = tipo
    .replace(
      /^(contrato|adicional|contractual|upgrade|tailor\s*made|tailor-made|tailormade)\s*[:\-–—]\s*/i,
      ""
    )
    .replace(/^(contrato|adicional|contractual|upgrade|tailor\s*made|tailor-made|tailormade)\s+/i, "")
    .trim();
  return cleaned || tipo.trim();
}
