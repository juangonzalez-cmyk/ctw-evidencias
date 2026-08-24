export type Fase = "pre_evento" | "durante_evento" | "post_evento";
export type FaseFiltro = "all" | Fase;

export const FASES: Fase[] = ["pre_evento", "durante_evento", "post_evento"];

export const FASE_LABEL: Record<Fase, string> = {
  pre_evento: "Pre evento",
  durante_evento: "Durante evento",
  post_evento: "Post evento",
};

export const FASE_EMOJI: Record<Fase, string> = {
  pre_evento: "🔵",
  durante_evento: "🟠",
  post_evento: "🟢",
};

// Tailwind classes for badges (using semantic-ish colors with explicit hues for the 3 phases).
export const FASE_BADGE_CLASS: Record<Fase, string> = {
  pre_evento: "bg-sky-100 text-sky-700 border-sky-300",
  durante_evento: "bg-orange-100 text-orange-700 border-orange-300",
  post_evento: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

export const FASE_TAB_ACTIVE_CLASS: Record<Fase, string> = {
  pre_evento: "bg-sky-500 text-white border-sky-500",
  durante_evento: "bg-orange-500 text-white border-orange-500",
  post_evento: "bg-emerald-500 text-white border-emerald-500",
};

export const isValidFase = (v: any): v is Fase =>
  v === "pre_evento" || v === "durante_evento" || v === "post_evento";

export const getFase = (t: { fase?: string | null }): Fase =>
  isValidFase(t.fase) ? t.fase : "durante_evento";

const CATEGORY_FASE: Record<string, Fase> = {
  "pre evento": "pre_evento",
  "durante evento": "durante_evento",
  "post evento": "post_evento",
  "ctw experiencia": "pre_evento",
  branding: "durante_evento",
  stands: "durante_evento",
  speaking: "durante_evento",
  workshop: "durante_evento",
};

/** Fase para informes: prioriza `category` (Notion) cuando el campo `fase` quedó desactualizado. */
export function getReportFase(t: {
  fase?: string | null;
  category?: string | null;
}): Fase {
  const cat = (t.category || "").trim().toLowerCase();
  if (cat && CATEGORY_FASE[cat]) return CATEGORY_FASE[cat];

  if (cat.includes("pre")) return "pre_evento";
  if (cat.includes("post")) return "post_evento";
  if (cat.includes("durante")) return "durante_evento";

  return getFase(t);
}
