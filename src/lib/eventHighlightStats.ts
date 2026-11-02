/** Métricas globales del evento para el informe de sponsors (HTML + PDF). */
export type EventHighlightStat = {
  value: string;
  label: string;
  accent: "yellow" | "blue" | "green";
};

export const EVENT_HIGHLIGHT_TITLE = "El evento en números";

export const EVENT_HIGHLIGHT_SUBTITLE =
  "Antes de entrar en el detalle de tus beneficios, así fue Colombia Tech Week + Colombia Tech Fest 2026 y fue posible también gracias a ustedes.";

export const DEFAULT_EVENT_HIGHLIGHT_STATS: EventHighlightStat[] = [
  { value: "+15,000", label: "Asistentes", accent: "yellow" },
  { value: "+50", label: "Países representados", accent: "blue" },
  { value: "+160", label: "Speakers", accent: "green" },
];

export const GOVTECH_EVENT_HIGHLIGHT_SUBTITLE =
  "Antes de entrar en el detalle de tus beneficios, así fue GovTech Summit 2026 y fue posible también gracias a ustedes.";

export const GOVTECH_EVENT_HIGHLIGHT_STATS: EventHighlightStat[] = [
  { value: "+1.000", label: "Asistentes", accent: "yellow" },
  { value: "+50", label: "Países representados", accent: "blue" },
  { value: "+150", label: "Speakers", accent: "green" },
];

/** GovTech se identifica por slug (govtech-summit-2026, govtech-…). */
export function isGovTechEvent(slug?: string | null): boolean {
  return !!slug && slug.trim().toLowerCase().startsWith("govtech");
}

export type EventBranding = {
  /** Marca paraguas que acompaña al nombre del evento ("Colombia Tech Week"); null = solo el evento. */
  orgLabel: string | null;
  highlightSubtitle: string;
  highlightStats: EventHighlightStat[];
};

/** Textos de marca del informe por evento. Sin slug o slug no-GovTech = comportamiento CTW/CTF original. */
export function getEventBranding(slug?: string | null): EventBranding {
  if (isGovTechEvent(slug)) {
    return {
      orgLabel: null,
      highlightSubtitle: GOVTECH_EVENT_HIGHLIGHT_SUBTITLE,
      highlightStats: GOVTECH_EVENT_HIGHLIGHT_STATS,
    };
  }
  return {
    orgLabel: "Colombia Tech Week",
    highlightSubtitle: EVENT_HIGHLIGHT_SUBTITLE,
    highlightStats: DEFAULT_EVENT_HIGHLIGHT_STATS,
  };
}

/** "<texto> · Colombia Tech Week" para CTW; solo "<texto>" si el evento no lleva marca paraguas. */
export function withOrgLabel(text: string, branding: EventBranding, sep = " · "): string {
  return branding.orgLabel ? `${text}${sep}${branding.orgLabel}` : text;
}

export const EVENT_HIGHLIGHT_ACCENT_HEX: Record<EventHighlightStat["accent"], string> = {
  yellow: "#f5c518",
  blue: "#3b82f6",
  green: "#96e631",
};

export const EVENT_HIGHLIGHT_ACCENT_RGB: Record<EventHighlightStat["accent"], [number, number, number]> = {
  yellow: [245, 197, 24],
  blue: [59, 130, 246],
  green: [150, 230, 49],
};
