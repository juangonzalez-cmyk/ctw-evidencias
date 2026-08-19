/** KAMs de CTF: ven el portafolio completo por patrocinador e informan. */
const KAM_NAME_RE = /(juan\s*camilo|daniela\s*serrano|manuela\s*garc[ií]a)/i;

export function isKamName(name: string | null | undefined): boolean {
  return KAM_NAME_RE.test((name || "").trim());
}
