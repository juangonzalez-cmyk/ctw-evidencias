/** Varios soportes por beneficio (foto + link, etc.). */

export type EvidenceKind = "photo" | "video" | "pdf" | "document" | "link";

export type EvidenceItem = {
  id: string;
  url: string;
  kind: EvidenceKind;
  label?: string | null;
  added_at: string;
  added_by?: string | null;
};

export function newEvidenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function asKind(raw: unknown, url: string): EvidenceKind {
  const k = String(raw || "").toLowerCase();
  if (k === "link" || k === "video" || k === "pdf" || k === "document" || k === "photo") {
    return k;
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.pdf(\?|$)/i.test(url)) return "pdf";
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt)(\?|$)/i.test(url)) return "document";
  if (/^https?:\/\//i.test(url) && !/\/evidencias\//i.test(url) && !/\/storage\/v1\/object\//i.test(url)) {
    return "link";
  }
  return "photo";
}

/** Lista efectiva: columna evidencias, o fallback a evidencia_url legacy. */
export function listEvidencias(task: {
  evidencias?: unknown;
  evidencia_url?: string | null;
  media_type?: string | null;
  hora_subida?: string | null;
  subido_por?: string | null;
}): EvidenceItem[] {
  const raw = task.evidencias;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((item): EvidenceItem | null => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const url = String(o.url || "").trim();
        if (!url) return null;
        return {
          id: String(o.id || newEvidenceId()),
          url,
          kind: asKind(o.kind ?? o.media_type, url),
          label: o.label == null ? null : String(o.label),
          added_at: String(o.added_at || new Date().toISOString()),
          added_by: o.added_by == null ? null : String(o.added_by),
        };
      })
      .filter((x): x is EvidenceItem => !!x);
  }

  const url = (task.evidencia_url || "").trim();
  if (!url) return [];
  return [
    {
      id: "legacy-primary",
      url,
      kind: asKind(task.media_type, url),
      label: null,
      added_at: task.hora_subida || new Date().toISOString(),
      added_by: task.subido_por || null,
    },
  ];
}

/** Primario para status/PDF: prioriza archivo sobre link. */
export function primaryEvidence(items: EvidenceItem[]): EvidenceItem | null {
  if (!items.length) return null;
  const file = items.find((i) => i.kind !== "link");
  return file || items[0];
}

export function primaryFields(items: EvidenceItem[]): {
  evidencia_url: string | null;
  media_type: string;
} {
  const p = primaryEvidence(items);
  if (!p) return { evidencia_url: null, media_type: "photo" };
  return { evidencia_url: p.url, media_type: p.kind };
}

export function evidenceKindLabel(kind: EvidenceKind): string {
  switch (kind) {
    case "link":
      return "Link";
    case "video":
      return "Video";
    case "pdf":
      return "PDF";
    case "document":
      return "Documento";
    default:
      return "Foto";
  }
}
