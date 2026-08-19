import { supabase } from "@/integrations/supabase/client";
import type { Task } from "@/hooks/useTasks";
import { buildSponsorEvidencePdf } from "@/lib/buildSponsorPdf";

export function staffInformePath(token: string): string {
  return `/informe/${token}?interno=1`;
}

export function publicInformeUrl(token: string): string {
  return `${window.location.origin}/informe/${token}`;
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
  const filename = `informe_${opts.sponsorName.replace(/\s+/g, "_")}_${opts.eventName.replace(/\s+/g, "_")}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Informe ${opts.sponsorName}`,
        text: `Informe de evidencias · ${opts.eventName}`,
      });
      return;
    } catch (shareErr) {
      if ((shareErr as Error)?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
