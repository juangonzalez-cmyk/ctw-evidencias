import type { Tables } from "@/integrations/supabase/types";

type Task = Tables<"tasks">;

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url) || url.includes("/evidencias/");
}

function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

async function urlToDataUrl(url: string): Promise<{ dataUrl: string; format: "PNG" | "JPEG" | "WEBP" } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && !isImageUrl(url)) return null;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Normalizar a JPEG vía canvas para evitar problemas de formato en jsPDF
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    const maxW = 1600;
    const scale = Math.min(1, maxW / img.width);
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), format: "JPEG" };
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export type BuildPdfOptions = {
  sponsorName: string;
  eventName: string;
  tasks: Task[];
};

/**
 * PDF de entrega: portada + una página por beneficio con la evidencia embebida
 * (sin depender de links externos / permisos de Drive).
 */
export async function buildSponsorEvidencePdf(opts: BuildPdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;

  const withEvidence = opts.tasks.filter(
    (t) => !t.deleted_at && t.evidencia_url && t.status !== "rechazado"
  );

  // Portada
  pdf.setFillColor(0, 0, 0);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setFillColor(150, 230, 49); // CTW green
  pdf.rect(0, 0, pageW, 8, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("COLOMBIA TECH WEEK", margin, 28);
  pdf.setFontSize(26);
  pdf.text("Informe de evidencias", margin, 48);
  pdf.setFontSize(16);
  pdf.setTextColor(150, 230, 49);
  pdf.text(opts.sponsorName, margin, 60);
  pdf.setTextColor(200, 200, 200);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(opts.eventName, margin, 72);
  pdf.text(`${withEvidence.length} evidencias incluidas`, margin, 80);
  pdf.text(
    `Generado ${new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}`,
    margin,
    88
  );
  pdf.setFontSize(9);
  pdf.text(
    "Las evidencias están embebidas en este PDF. No requiere permisos externos.",
    margin,
    pageH - 20
  );

  for (let i = 0; i < withEvidence.length; i++) {
    const t = withEvidence[i];
    pdf.addPage();

    // Header
    pdf.setFillColor(0, 0, 0);
    pdf.rect(0, 0, pageW, 22, "F");
    pdf.setFillColor(150, 230, 49);
    pdf.rect(0, 22, pageW, 1.5, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(opts.sponsorName, margin, 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(180, 180, 180);
    pdf.text(`${i + 1} / ${withEvidence.length}  ·  ${opts.eventName}`, margin, 16);

    // Benefit title
    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    const titleLines = pdf.splitTextToSize(t.tipo_beneficio || "Beneficio", pageW - margin * 2);
    pdf.text(titleLines, margin, 32);

    let y = 32 + titleLines.length * 6 + 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    const meta = [
      t.marca,
      t.dia || null,
      t.hora || null,
      t.responsable || null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    pdf.text(meta, margin, y);
    y += 8;

    const url = t.evidencia_url!;
    const imgAreaTop = y;
    const imgAreaH = pageH - imgAreaTop - 18;
    const imgAreaW = pageW - margin * 2;

    if (isVideoUrl(url) || isPdfUrl(url)) {
      pdf.setFillColor(245, 245, 242);
      pdf.roundedRect(margin, imgAreaTop, imgAreaW, 40, 3, 3, "F");
      pdf.setTextColor(40, 40, 40);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(isVideoUrl(url) ? "Evidencia en video" : "Evidencia en PDF", margin + 6, imgAreaTop + 16);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      const note = isVideoUrl(url)
        ? "El video está alojado en el almacenamiento del evento (acceso público del informe)."
        : "Documento PDF de soporte incluido en el almacenamiento del evento.";
      pdf.text(pdf.splitTextToSize(note, imgAreaW - 12), margin + 6, imgAreaTop + 24);
      // Still try thumbnail if somehow image
    } else {
      const embedded = await urlToDataUrl(url);
      if (embedded) {
        const props = pdf.getImageProperties(embedded.dataUrl);
        const ratio = Math.min(imgAreaW / props.width, imgAreaH / props.height);
        const w = props.width * ratio;
        const h = props.height * ratio;
        const x = margin + (imgAreaW - w) / 2;
        pdf.addImage(embedded.dataUrl, embedded.format, x, imgAreaTop, w, h, undefined, "FAST");
      } else {
        pdf.setFillColor(255, 240, 240);
        pdf.roundedRect(margin, imgAreaTop, imgAreaW, 36, 3, 3, "F");
        pdf.setTextColor(160, 40, 40);
        pdf.setFontSize(10);
        pdf.text(
          "No se pudo embeber esta evidencia. Re-materialízala en el storage del evento.",
          margin + 6,
          imgAreaTop + 18
        );
      }
    }

    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text("Colombia Tech Week · Evidencias", margin, pageH - 8);
  }

  return pdf.output("blob");
}
