// Shared brand normalization map for sponsor unification across tabs.
export const BRAND_GROUPS: Record<string, string[]> = {
  Akua: ["Akua", "Akua Ops", "Akua Ops LLC"],
  Applying: ["Applying", "Applying Consulting", "Applying Cloud"],
  CEIBA: ["CEIBA", "Ceiba", "CEIBA Software House"],
  "Go to Cloud": ["Go to Cloud", "Go to cloud"],
  HubSpot: ["HubSpot", "Hubspot"],
  "La Valentina": ["La Valentina", "LaValentina"],
  "MERCATELY INC": ["MERCATELY INC", "Mercately"],
  "Muno Lab": ["Muno Labs", "MunoLabs", "MunoLab"],
  "Takum - Monday": ["Takum", "Monday"],
  "Service Lab": ["Equinix", "HPE", "AMD", "ServiceIA", "ServiceLab", "Engineering System"],
  "Semana - Dinero": ["Semana", "Dinero"],
  "Make - Celonis": ["Make", "Make-Celonis"],
  "Due Legal": ["Due Legal", "DUE LEGAL", "Duelegal", "Due Legal SAS"],
};

const BRAND_LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [unified, variants] of Object.entries(BRAND_GROUPS)) {
    for (const v of variants) map[v.trim().toLowerCase()] = unified;
  }
  return map;
})();

export const unifyBrand = (raw: string | null | undefined): string => {
  const key = (raw || "").trim().toLowerCase();
  return BRAND_LOOKUP[key] || (raw || "Sin marca").trim();
};
