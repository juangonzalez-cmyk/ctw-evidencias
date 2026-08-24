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
