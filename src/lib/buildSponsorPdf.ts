import type { Tables } from "@/integrations/supabase/types";
import { formatEntregaBogota, isStandRecepcion } from "@/lib/standRecepcion";
import { listEvidencias } from "@/lib/evidencias";
import {
  benefitTitle,
  buildReportBuckets,
  buildThankYouIntro,
  FASES,
  FASE_LABEL,
  formatReportDateTime,
  lastEvidenceAt,
} from "@/lib/sponsorReportModel";

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
  eventShortName?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  tasks: Task[];
  surveyAnswers?: SurveyAnswerForPdf[];
};

const GREEN: [number, number, number] = [150, 230, 49];
const BLACK: [number, number, number] = [0, 0, 0];

/**
 * PDF narrativo: portada con agradecimiento, resumen, evidencias por fase y milla extra.
 */
export async function buildSponsorEvidencePdf(opts: BuildPdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 16;

  const buckets = buildReportBuckets(opts.tasks);
  const thankYou = buildThankYouIntro({
    sponsorName: opts.sponsorName,
    eventName: opts.eventName,
    startsOn: opts.startsOn,
    endsOn: opts.endsOn,
    withEvidenceCount: buckets.withEvidence.length,
  });
  const updatedAt = lastEvidenceAt(buckets.active);
  const short = opts.eventShortName || opts.eventName;

  const paintDarkHeader = (subtitle: string) => {
    pdf.setFillColor(...BLACK);
    pdf.rect(0, 0, pageW, 24, "F");
    pdf.setFillColor(...GREEN);
    pdf.rect(0, 24, pageW, 1.8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(opts.sponsorName, margin, 11);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(180, 180, 180);
    pdf.text(subtitle, margin, 18);
  };

  const drawFooter = () => {
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text("Colombia Tech Week · Informe de evidencias", margin, pageH - 8);
  };

  // —— Portada ——
  pdf.setFillColor(...BLACK);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, pageW, 6, "F");

  pdf.setTextColor(180, 180, 180);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("01  /  INFORME DE SPONSOR", margin, 28);

  pdf.setTextColor(200, 200, 200);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text("Hola equipo", margin, 42);

  pdf.setTextColor(...GREEN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.text(opts.sponsorName, margin, 56);

  pdf.setTextColor(180, 180, 180);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`${opts.eventName} · Colombia Tech Week`, margin, 66);

  let y = 82;
  pdf.setTextColor(230, 230, 230);
  pdf.setFontSize(11);
  for (const block of [thankYou.headline, thankYou.body, thankYou.closing]) {
    const lines = pdf.splitTextToSize(block, pageW - margin * 2);
    pdf.text(lines, margin, y);
    y += lines.length * 5.5 + 6;
  }

  pdf.setTextColor(...GREEN);
  pdf.setFontSize(10);
  pdf.text(`${buckets.withEvidence.length} evidencias · ${buckets.active.length} beneficios`, margin, pageH - 36);
  pdf.setTextColor(140, 140, 140);
  pdf.setFontSize(8);
  pdf.text(`Actualizado ${formatReportDateTime(updatedAt)}`, margin, pageH - 28);
  pdf.text("Las evidencias van embebidas. No requiere permisos externos.", margin, pageH - 20);

  // —— Resumen ——
  pdf.addPage();
  paintDarkHeader(`${short} · Resumen`);
  y = 38;
  pdf.setTextColor(40, 40, 40);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("02  /  RESUMEN", margin, y);
  y += 10;

  const stats: [string, string][] = [
    ["Con evidencia", String(buckets.withEvidence.length)],
    ["Beneficios", String(buckets.active.length)],
    ["Milla extra", String(buckets.millaExtra.length)],
    [
      "Fases",
      buckets.phasesCovered.length
        ? buckets.phasesCovered.map((f) => FASE_LABEL[f]).join(", ")
        : "—",
    ],
  ];
  const cardW = (pageW - margin * 2 - 6) / 2;
  stats.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * (cardW + 6);
    const cy = y + row * 28;
    pdf.setFillColor(245, 245, 242);
    pdf.roundedRect(x, cy, cardW, 24, 3, 3, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(label, x + 4, cy + 8);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(value.length > 18 ? 9 : 14);
    pdf.setTextColor(0, 120, 50);
    const vLines = pdf.splitTextToSize(value, cardW - 8);
    pdf.text(vLines, x + 4, cy + 16);
  });
  drawFooter();

  // —— Encuesta ——
  if (opts.surveyAnswers && opts.surveyAnswers.length > 0) {
    pdf.addPage();
    paintDarkHeader("Encuesta de satisfacción");
    y = 38;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(20, 20, 20);
    pdf.text("Respuestas de la encuesta", margin, y);
    y += 12;
    for (const a of opts.surveyAnswers) {
      if (y > pageH - 30) {
        pdf.addPage();
        paintDarkHeader("Encuesta de satisfacción");
        y = 38;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      const promptLines = pdf.splitTextToSize(a.prompt || "Pregunta", pageW - margin * 2);
      pdf.text(promptLines, margin, y);
      y += promptLines.length * 5 + 2;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      const val =
        a.value === null || a.value === undefined || a.value === "" ? "—" : String(a.value);
      const valLines = pdf.splitTextToSize(val, pageW - margin * 2);
      pdf.text(valLines, margin, y);
      y += valLines.length * 6 + 8;
    }
    drawFooter();
  }

  const drawEmbeddedImage = async (
    url: string,
    label: string,
    top: number,
    maxH: number
  ): Promise<number> => {
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
        isVideoUrl(url) ? "Evidencia en video" : "Documento PDF",
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

  const renderEvidenceTask = async (t: Task, indexLabel: string) => {
    pdf.addPage();
    paintDarkHeader(indexLabel);
    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    const titleLines = pdf.splitTextToSize(benefitTitle(t), pageW - margin * 2);
    pdf.text(titleLines, margin, 36);

    let cursor = 36 + titleLines.length * 6 + 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    const meta = [t.dia, t.hora, t.stage, t.speaker].filter(Boolean).join(" · ");
    if (meta) {
      pdf.text(meta, margin, cursor);
      cursor += 6;
    }

    if (isStandRecepcion(t)) {
      pdf.setTextColor(40, 40, 40);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text("Recepción de stand", margin, cursor + 4);
      cursor += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(70, 70, 70);
      pdf.text(`Firmante: ${t.firma_nombre || "—"}`, margin, cursor);
      cursor += 5;
      pdf.text(`Entrega CTW: ${formatEntregaBogota(t.entrega_ctw_at)}`, margin, cursor);
      cursor += 5;
      pdf.text(`Entrega sponsor: ${formatEntregaBogota(t.entrega_sponsor_at)}`, margin, cursor);
      cursor += 6;
      const items = listEvidencias(t);
      const photo = items.find((i) => i.kind !== "link") || (t.evidencia_url ? { url: t.evidencia_url } : null);
      if (photo?.url) cursor = await drawEmbeddedImage(photo.url, "Foto del stand", cursor, 70);
      if (t.acta_recepcion_url) {
        if (cursor > pageH - 80) {
          pdf.addPage();
          paintDarkHeader(indexLabel);
          cursor = 36;
        }
        await drawEmbeddedImage(t.acta_recepcion_url, "Acta firmada", cursor, 90);
      }
    } else {
      const items = listEvidencias(t);
      const imgAreaW = pageW - margin * 2;
      cursor += 4;
      for (const item of items.length
        ? items
        : t.evidencia_url
          ? [{ url: t.evidencia_url, kind: t.media_type || "photo" }]
          : []) {
        if (cursor > pageH - 60) {
          pdf.addPage();
          paintDarkHeader(indexLabel);
          cursor = 36;
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
            kind === "link" ? "Evidencia en link" : isVideoUrl(url) ? "Video" : "PDF",
            margin + 6,
            cursor + 14
          );
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          pdf.text(pdf.splitTextToSize(url, imgAreaW - 12), margin + 6, cursor + 22);
          cursor += 44;
        } else {
          cursor = await drawEmbeddedImage(url, "Soporte", cursor, 70);
        }
      }
    }
    drawFooter();
  };

  // —— Evidencias contractuales por fase ——
  let globalIdx = 0;
  for (const fase of FASES) {
    const list = buckets.byFaseContractual[fase];
    if (!list.length) continue;
    pdf.addPage();
    paintDarkHeader(`03 / Evidencias · ${FASE_LABEL[fase]}`);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(20, 20, 20);
    pdf.text(FASE_LABEL[fase], margin, 42);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(90, 90, 90);
    pdf.text(`${list.length} evidencia${list.length === 1 ? "" : "s"} en esta fase`, margin, 52);
    drawFooter();

    for (const t of list) {
      globalIdx += 1;
      await renderEvidenceTask(t, `${globalIdx} / ${buckets.withEvidence.length} · ${FASE_LABEL[fase]}`);
    }
  }

  // —— Milla extra ——
  if (buckets.millaExtraWithEvidence.length > 0) {
    pdf.addPage();
    paintDarkHeader("Extra / Más allá del contrato");
    pdf.setFillColor(240, 255, 220);
    pdf.roundedRect(margin, 34, pageW - margin * 2, 42, 4, 4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(0, 100, 40);
    pdf.text("LA MILLA EXTRA", margin + 6, 44);
    pdf.setFontSize(14);
    pdf.setTextColor(20, 20, 20);
    const extraTitle = pdf.splitTextToSize(
      "Desde Customer Success damos una milla extra por ti",
      pageW - margin * 2 - 12
    );
    pdf.text(extraTitle, margin + 6, 54);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text("Beneficios que entregamos más allá de lo contratado.", margin + 6, 68);
    drawFooter();

    for (const t of buckets.millaExtraWithEvidence) {
      globalIdx += 1;
      await renderEvidenceTask(t, `${globalIdx} / ${buckets.withEvidence.length} · Milla extra`);
    }
  }

  // —— Cierre ——
  pdf.addPage();
  pdf.setFillColor(...BLACK);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, pageW, 6, "F");
  pdf.setTextColor(230, 230, 230);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  const close = pdf.splitTextToSize(
    "¡Gracias por sumarte al sueño de poner a Colombia en el mapa por su talento, su ecosistema tech y la visión de un país que adopta la tecnología con propósito!",
    pageW - margin * 2
  );
  pdf.text(close, margin, 80);
  pdf.setTextColor(...GREEN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(opts.sponsorName, margin, 120);
  pdf.setTextColor(160, 160, 160);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Generado por ${short} · Colombia Tech Week`, margin, pageH - 28);
  pdf.text(`Actualizado ${formatReportDateTime(updatedAt)}`, margin, pageH - 20);

  return pdf.output("blob");
}
