import type { Tables } from "@/integrations/supabase/types";
import { formatEntregaBogota, isStandRecepcion } from "@/lib/standRecepcion";
import { listEvidencias } from "@/lib/evidencias";

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

async function urlToDataUrl(
  url: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" | "WEBP" } | null> {
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

export type SurveyAnswerForPdf = {
  prompt: string;
  value: string | number | null;
};

export type BuildPdfOptions = {
  sponsorName: string;
  eventName: string;
  tasks: Task[];
  surveyAnswers?: SurveyAnswerForPdf[];
};

/**
 * PDF de entrega: portada + encuesta respondida + evidencias embebidas.
 */
export async function buildSponsorEvidencePdf(opts: BuildPdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;

  const withEvidence = opts.tasks.filter(
    (t) =>
      !t.deleted_at &&
      t.status !== "rechazado" &&
      (t.evidencia_url || (isStandRecepcion(t) && t.acta_recepcion_url))
  );

  // Portada
  pdf.setFillColor(0, 0, 0);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setFillColor(150, 230, 49);
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
  if (opts.surveyAnswers && opts.surveyAnswers.length > 0) {
    pdf.setTextColor(150, 230, 49);
    pdf.text("Incluye encuesta de satisfacción respondida", margin, 100);
  }
  pdf.setTextColor(180, 180, 180);
  pdf.setFontSize(9);
  pdf.text(
    "Las evidencias están embebidas en este PDF. No requiere permisos externos.",
    margin,
    pageH - 20
  );

  // Encuesta
  if (opts.surveyAnswers && opts.surveyAnswers.length > 0) {
    pdf.addPage();
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
    pdf.text("Encuesta de satisfacción", margin, 16);

    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Respuestas de la encuesta", margin, 36);

    let y = 48;
    for (const a of opts.surveyAnswers) {
      if (y > pageH - 30) {
        pdf.addPage();
        y = 24;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      const promptLines = pdf.splitTextToSize(a.prompt || "Pregunta", pageW - margin * 2);
      pdf.text(promptLines, margin, y);
      y += promptLines.length * 5 + 2;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      const val =
        a.value === null || a.value === undefined || a.value === ""
          ? "—"
          : String(a.value);
      const valLines = pdf.splitTextToSize(val, pageW - margin * 2);
      pdf.text(valLines, margin, y);
      y += valLines.length * 6 + 8;
      pdf.setDrawColor(230, 230, 230);
      pdf.line(margin, y - 4, pageW - margin, y - 4);
    }
  }

  for (let i = 0; i < withEvidence.length; i++) {
    const t = withEvidence[i];
    pdf.addPage();

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

    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    const titleLines = pdf.splitTextToSize(t.tipo_beneficio || "Beneficio", pageW - margin * 2);
    pdf.text(titleLines, margin, 32);

    let y = 32 + titleLines.length * 6 + 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    const meta = [t.marca, t.dia, t.hora, t.stage, t.speaker].filter(Boolean).join(" · ");
    pdf.text(meta, margin, y);
    y += 6;

    if (isStandRecepcion(t)) {
      pdf.setTextColor(40, 40, 40);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text("Recepción de stand", margin, y + 4);
      y += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(70, 70, 70);
      pdf.text(`Firmante: ${t.firma_nombre || "—"}`, margin, y);
      y += 5;
      pdf.text(`Entrega a Colombia Tech: ${formatEntregaBogota(t.entrega_ctw_at)}`, margin, y);
      y += 5;
      pdf.text(`Entrega al sponsor: ${formatEntregaBogota(t.entrega_sponsor_at)}`, margin, y);
      y += 4;
    }

    const drawEmbeddedImage = async (url: string, label: string, top: number, maxH: number) => {
      const imgAreaW = pageW - margin * 2;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(40, 40, 40);
      pdf.text(label, margin, top);
      const imgTop = top + 4;
      if (isVideoUrl(url) || isPdfUrl(url)) {
        pdf.setFillColor(245, 245, 242);
        pdf.roundedRect(margin, imgTop, imgAreaW, 28, 3, 3, "F");
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          isVideoUrl(url) ? "Evidencia en video (almacenamiento del evento)" : "Documento PDF",
          margin + 6,
          imgTop + 16
        );
        return imgTop + 32;
      }
      const embedded = await urlToDataUrl(url);
      if (embedded) {
        const props = pdf.getImageProperties(embedded.dataUrl);
        const ratio = Math.min(imgAreaW / props.width, maxH / props.height);
        const w = props.width * ratio;
        const h = props.height * ratio;
        const x = margin + (imgAreaW - w) / 2;
        pdf.addImage(embedded.dataUrl, embedded.format, x, imgTop, w, h, undefined, "FAST");
        return imgTop + h + 4;
      }
      pdf.setFillColor(255, 240, 240);
      pdf.roundedRect(margin, imgTop, imgAreaW, 24, 3, 3, "F");
      pdf.setTextColor(160, 40, 40);
      pdf.setFontSize(9);
      pdf.text("No se pudo embeber esta evidencia.", margin + 6, imgTop + 14);
      return imgTop + 28;
    };

    if (isStandRecepcion(t)) {
      let cursor = y + 4;
      const items = listEvidencias(t);
      const photo = items.find((i) => i.kind !== "link") || (t.evidencia_url ? { url: t.evidencia_url } : null);
      if (photo?.url) {
        cursor = await drawEmbeddedImage(photo.url, "Foto del stand", cursor, 70);
      }
      if (t.acta_recepcion_url) {
        if (cursor > pageH - 80) {
          pdf.addPage();
          cursor = 24;
        }
        await drawEmbeddedImage(t.acta_recepcion_url, "Acta de recepción firmada", cursor, 90);
      }
    } else {
      const items = listEvidencias(t);
      let cursor = y + 8;
      const imgAreaW = pageW - margin * 2;

      for (const item of items.length ? items : t.evidencia_url ? [{ url: t.evidencia_url, kind: t.media_type || "photo" }] : []) {
        if (cursor > pageH - 60) {
          pdf.addPage();
          cursor = 24;
        }
        const url = item.url;
        const kind = "kind" in item ? item.kind : t.media_type;

        if (isVideoUrl(url) || isPdfUrl(url) || kind === "link") {
          pdf.setFillColor(245, 245, 242);
          pdf.roundedRect(margin, cursor, imgAreaW, 36, 3, 3, "F");
          pdf.setTextColor(40, 40, 40);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.text(
            kind === "link"
              ? "Evidencia en link"
              : isVideoUrl(url)
                ? "Evidencia en video"
                : "Evidencia en PDF",
            margin + 6,
            cursor + 14
          );
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          const note =
            kind === "link"
              ? url
              : isVideoUrl(url)
                ? "Video incluido en el almacenamiento del evento."
                : "Documento PDF de soporte incluido en el almacenamiento del evento.";
          pdf.text(pdf.splitTextToSize(note, imgAreaW - 12), margin + 6, cursor + 22);
          cursor += 44;
        } else {
          cursor = await drawEmbeddedImage(url, "Soporte", cursor, 70);
        }
      }
    }

    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text("Colombia Tech Week · Evidencias", margin, pageH - 8);
  }

  return pdf.output("blob");
}
