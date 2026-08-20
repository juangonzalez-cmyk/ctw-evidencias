import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import type { Task } from "@/hooks/useTasks";
import { buildSponsorEvidencePdf } from "@/lib/buildSponsorPdf";

/** Vista interna del equipo (misma URL pública + flag). */
export function staffInformePath(token: string): string {
  return `/informe/${token}?interno=1`;
}

/** Link enviable al sponsor: HTML público, sin login ni perfil. */
export function publicInformeUrl(token: string): string {
  return `${window.location.origin}/informe/${token}`;
}

export function sanitizePdfFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").slice(0, 120);
}

/**
 * Descarga un PDF como archivo. No usa Web Share (evita el “elegir cómo abrir”).
 */
export function downloadPdfFile(blob: Blob, filename: string): void {
  const safe = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  const pdfBlob =
    blob.type === "application/pdf"
      ? blob
      : new Blob([blob], { type: "application/pdf" });
  saveAs(pdfBlob, safe);
}

export async function ensureSponsorReportTokens(
  eventId: string,
  sponsorNames: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!eventId || sponsorNames.length === 0) return map;

  const { data: existing } = await supabase
    .from("sponsor_reports")
    .select("sponsor_unified_name, token")
    .eq("event_id", eventId);
  for (const r of existing ?? []) map[r.sponsor_unified_name] = r.token;

  const missing = sponsorNames.filter((n) => !map[n]);
  if (missing.length) {
    const { data: created } = await supabase
      .from("sponsor_reports")
      .insert(
        missing.map((sponsor_unified_name) => ({
          event_id: eventId,
          sponsor_unified_name,
        }))
      )
      .select("sponsor_unified_name, token");
    for (const r of created ?? []) map[r.sponsor_unified_name] = r.token;
  }
  return map;
}

export async function downloadSponsorPdfBlob(opts: {
  sponsorName: string;
  eventName: string;
  tasks: Task[];
}): Promise<void> {
  const blob = await buildSponsorEvidencePdf({
    sponsorName: opts.sponsorName,
    eventName: opts.eventName,
    tasks: opts.tasks,
  });
  const filename = `informe_${sanitizePdfFilename(opts.sponsorName)}_${sanitizePdfFilename(opts.eventName)}.pdf`;
  downloadPdfFile(blob, filename);
}
