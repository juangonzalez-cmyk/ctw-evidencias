import type { Tables } from "@/integrations/supabase/types";
import { formatEntregaBogota, isStandRecepcion } from "@/lib/standRecepcion";
import { listEvidencias, type EvidenceItem } from "@/lib/evidencias";
import {
  benefitTitle,
  buildReportBuckets,
  buildThankYouIntro,
  FASES,
  FASE_LABEL,
  formatReportDateTime,
  lastEvidenceAt,
} from "@/lib/sponsorReportModel";
import { isMillaExtra } from "@/lib/tipoEntrega";

type Task = Tables<"tasks">;

const GREEN: [number, number, number] = [150, 230, 49];
const BLACK: [number, number, number] = [10, 10, 10];
const INK: [number, number, number] = [22, 22, 22];
const MUTED: [number, number, number] = [110, 110, 110];
const PAPER: [number, number, number] = [250, 250, 247];
const CARD: [number, number, number] = [245, 245, 240];

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

type Embed =
  | { kind: "image"; dataUrl: string; format: "JPEG" | "PNG" | "WEBP"; w: number; h: number }
  | { kind: "pdf-pages"; pages: { dataUrl: string; w: number; h: number }[] }
  | { kind: "link"; url: string; host: string }
  | { kind: "video"; url: string }
  | { kind: "missing"; note: string };

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url) || /\/evidencias\/.+\.pdf/i.test(url);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/** Drive view → intento de imagen directa. */
function normalizeExternalImageUrl(url: string): string[] {
  const out = [url];
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (drive?.[1]) {
    const id = drive[1];
    out.unshift(
      `https://drive.google.com/uc?export=view&id=${id}`,
      `https://lh3.googleusercontent.com/d/${id}=w2000`
    );
  }
  const uc = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (uc?.[1] && !drive) {
    out.unshift(`https://drive.google.com/uc?export=view&id=${uc[1]}`);
  }
  return out;
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

async function imageBlobToEmbed(blob: Blob): Promise<Embed | null> {
  if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    const maxW = 2200;
    const scale = Math.min(1, maxW / Math.max(1, img.width));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      kind: "image",
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      format: "JPEG",
      w: canvas.width,
      h: canvas.height,
    };
  } catch {
    return null;
  }
}

async function renderPdfPages(bytes: ArrayBuffer, maxPages = 3): Promise<Embed | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();

    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pages: { dataUrl: string; w: number; h: number }[] = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx,
        viewport,
      } as Parameters<typeof page.render>[0]).promise;
      pages.push({
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        w: canvas.width,
        h: canvas.height,
      });
    }
    if (!pages.length) return null;
    return { kind: "pdf-pages", pages };
  } catch (e) {
    console.warn("pdf render failed", e);
    return null;
  }
}

async function resolveEmbed(url: string, kindHint?: string | null): Promise<Embed> {
  if (!url?.trim()) return { kind: "missing", note: "Sin archivo" };
  if (kindHint === "link" || (!url.includes("supabase") && !isPdfUrl(url) && !/\.(png|jpe?g|webp|gif)/i.test(url) && /docs\.google|drive\.google|http/i.test(url) && kindHint !== "photo")) {
    // photo hosted on Drive still tries image first below
  }
  if (isVideoUrl(url) || kindHint === "video") return { kind: "video", url };

  const candidates = normalizeExternalImageUrl(url);
  let lastBlob: Blob | null = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { mode: "cors" });
      if (!res.ok) continue;
      const blob = await res.blob();
      lastBlob = blob;
      const type = blob.type || "";

      if (type.includes("pdf") || kindHint === "pdf" || isPdfUrl(candidate) || isPdfUrl(url)) {
        const pages = await renderPdfPages(await blob.arrayBuffer(), 3);
        if (pages) return pages;
      }

      if (type.startsWith("image/") || kindHint === "photo" || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(candidate)) {
        const img = await imageBlobToEmbed(blob);
        if (img) return img;
      }

      // octet-stream: probar como imagen y luego PDF
      if (type === "application/octet-stream" || !type) {
        const img = await imageBlobToEmbed(new Blob([blob], { type: "image/jpeg" }));
        if (img) return img;
        const pages = await renderPdfPages(await blob.arrayBuffer(), 3);
        if (pages) return pages;
      }
    } catch {
      /* try next */
    }
  }

  if (lastBlob) {
    try {
      if (lastBlob.type.includes("pdf") || kindHint === "pdf") {
        const pages = await renderPdfPages(await lastBlob.arrayBuffer(), 3);
        if (pages) return pages;
      }
    } catch {
      /* ignore */
    }
  }

  if (kindHint === "link" || /^https?:\/\//i.test(url)) {
    return { kind: "link", url, host: hostOf(url) };
  }
  return { kind: "missing", note: "No se pudo embeber este soporte" };
}

function fitBox(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const ratio = Math.min(maxW / srcW, maxH / srcH);
  return { w: srcW * ratio, h: srcH * ratio };
}

/**
 * Informe editorial CTW: portada, resumen, evidencias a tamaño real y PDFs embebidos página a página.
 */
export async function buildSponsorEvidencePdf(opts: BuildPdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 10;
  const usableBottom = pageH - 16;

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

  const setFill = (c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
  const setText = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);

  const paintTopBar = (left: string, right: string) => {
    setFill(BLACK);
    pdf.rect(0, 0, pageW, 18, "F");
    setFill(GREEN);
    pdf.rect(0, 18, pageW, 1.6, "F");
    setText([255, 255, 255]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(left, margin, 8.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    setText([170, 170, 170]);
    pdf.text(right, margin, 14);
  };

  const paintFooter = (pageLabel?: string) => {
    setText([150, 150, 150]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("Colombia Tech Week · Informe de evidencias", margin, footerY);
    if (pageLabel) {
      pdf.text(pageLabel, pageW - margin, footerY, { align: "right" });
    }
  };

  const newContentPage = (left: string, right: string) => {
    pdf.addPage();
    setFill(PAPER);
    pdf.rect(0, 0, pageW, pageH, "F");
    paintTopBar(left, right);
  };

  // ——— Portada ———
  setFill(BLACK);
  pdf.rect(0, 0, pageW, pageH, "F");
  setFill(GREEN);
  pdf.rect(0, 0, pageW, 5, "F");
  pdf.rect(0, pageH - 5, pageW, 5, "F");

  setText([140, 140, 140]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("01  /  INFORME DE SPONSOR", margin, 28);

  setText([200, 200, 200]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.text("Hola equipo", margin, 48);

  setText(GREEN);
  pdf.setFont("helvetica", "bold");
  const nameSize = opts.sponsorName.length > 18 ? 26 : 34;
  pdf.setFontSize(nameSize);
  const nameLines = pdf.splitTextToSize(opts.sponsorName, contentW);
  pdf.text(nameLines, margin, 64);

  let y = 64 + nameLines.length * (nameSize * 0.4) + 6;
  setText([160, 160, 160]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`${opts.eventName}  ·  Colombia Tech Week`, margin, y);
  y += 14;

  setFill([28, 28, 28]);
  pdf.roundedRect(margin, y, contentW, 0.4, 0, 0, "F");
  y += 12;

  setText([235, 235, 235]);
  pdf.setFontSize(11);
  for (const block of [thankYou.headline, thankYou.body]) {
    const lines = pdf.splitTextToSize(block, contentW);
    pdf.text(lines, margin, y);
    y += lines.length * 5.8 + 7;
  }

  setText(GREEN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  const closeLines = pdf.splitTextToSize(thankYou.closing, contentW);
  pdf.text(closeLines, margin, y);

  setText([130, 130, 130]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    `${buckets.withEvidence.length} evidencias embebidas  ·  ${buckets.active.length} beneficios`,
    margin,
    pageH - 28
  );
  pdf.setFontSize(8);
  pdf.text(`Actualizado ${formatReportDateTime(updatedAt)}`, margin, pageH - 20);

  // ——— Resumen ———
  newContentPage(opts.sponsorName, `${short} · Resumen`);
  y = 32;
  setText(MUTED);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("02  /  RESUMEN", margin, y);
  y += 10;
  setText(INK);
  pdf.setFontSize(22);
  pdf.text("Lo que entregamos", margin, y);
  y += 12;

  const stats: { label: string; value: string }[] = [
    { label: "Evidencias", value: String(buckets.withEvidence.length) },
    { label: "Beneficios", value: String(buckets.active.length) },
    { label: "Milla extra", value: String(buckets.millaExtra.length) },
    {
      label: "Fases",
      value: buckets.phasesCovered.length
        ? buckets.phasesCovered.map((f) => FASE_LABEL[f].replace(" evento", "")).join(" · ")
        : "—",
    },
  ];
  const gap = 4;
  const cardW = (contentW - gap) / 2;
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * (cardW + gap);
    const cy = y + row * 36;
    setFill(CARD);
    pdf.roundedRect(x, cy, cardW, 32, 3, 3, "F");
    setFill(GREEN);
    pdf.rect(x, cy, 2.2, 32, "F");
    setText(MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(s.label.toUpperCase(), x + 8, cy + 10);
    setText(INK);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(s.value.length > 16 ? 11 : 18);
    const vLines = pdf.splitTextToSize(s.value, cardW - 14);
    pdf.text(vLines, x + 8, cy + 20);
  });
  y += 84;

  setText(MUTED);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("ÍNDICE DE BENEFICIOS CON EVIDENCIA", margin, y);
  y += 7;

  const indexTasks = [
    ...FASES.flatMap((f) =>
      buckets.byFaseContractual[f].map((t) => ({ t, section: FASE_LABEL[f] }))
    ),
    ...buckets.millaExtraWithEvidence.map((t) => ({ t, section: "Milla extra" })),
  ];

  for (let i = 0; i < indexTasks.length; i++) {
    if (y > usableBottom - 8) {
      paintFooter();
      newContentPage(opts.sponsorName, "Índice");
      y = 32;
    }
    const { t, section } = indexTasks[i];
    setText(GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(String(i + 1).padStart(2, "0"), margin, y);
    setText(INK);
    pdf.setFont("helvetica", "normal");
    const lines = pdf.splitTextToSize(benefitTitle(t), contentW - 52);
    pdf.text(lines, margin + 12, y);
    setText(MUTED);
    pdf.setFontSize(7.5);
    pdf.text(section, pageW - margin, y, { align: "right" });
    y += Math.max(6.5, lines.length * 4.6) + 2.5;
  }
  paintFooter();

  // Survey
  if (opts.surveyAnswers?.length) {
    newContentPage(opts.sponsorName, "Encuesta");
    y = 32;
    setText(MUTED);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("ENCUESTA DE SATISFACCIÓN", margin, y);
    y += 10;
    for (const a of opts.surveyAnswers) {
      if (y > usableBottom - 20) {
        paintFooter();
        newContentPage(opts.sponsorName, "Encuesta");
        y = 32;
      }
      setText(INK);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const p = pdf.splitTextToSize(a.prompt || "Pregunta", contentW);
      pdf.text(p, margin, y);
      y += p.length * 5 + 2;
      setText([40, 40, 40]);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      const val =
        a.value === null || a.value === undefined || a.value === "" ? "—" : String(a.value);
      const v = pdf.splitTextToSize(val, contentW);
      pdf.text(v, margin, y);
      y += v.length * 6 + 8;
    }
    paintFooter();
  }

  const drawImageBlock = (
    dataUrl: string,
    srcW: number,
    srcH: number,
    top: number,
    maxH: number,
    label?: string
  ): number => {
    let cursor = top;
    if (label) {
      setText(MUTED);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.text(label.toUpperCase(), margin, cursor);
      cursor += 5;
    }
    const box = fitBox(srcW, srcH, contentW, Math.max(40, maxH - (cursor - top)));
    const x = margin + (contentW - box.w) / 2;
    // soft frame
    setFill([235, 235, 230]);
    pdf.roundedRect(x - 1, cursor - 1, box.w + 2, box.h + 2, 2, 2, "F");
    pdf.addImage(dataUrl, "JPEG", x, cursor, box.w, box.h, undefined, "FAST");
    return cursor + box.h + 4;
  };

  const drawLinkCard = (url: string, host: string, top: number): number => {
    const h = 42;
    setFill(CARD);
    pdf.roundedRect(margin, top, contentW, h, 4, 4, "F");
    setFill(GREEN);
    pdf.rect(margin, top, 3, h, "F");
    setText(MUTED);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text("DOCUMENTO EXTERNO", margin + 10, top + 10);
    setText(INK);
    pdf.setFontSize(13);
    pdf.text(host, margin + 10, top + 20);
    setText(MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const lines = pdf.splitTextToSize(url, contentW - 20);
    pdf.text(lines.slice(0, 2), margin + 10, top + 28);
    return top + h + 6;
  };

  const drawMissingCard = (note: string, top: number): number => {
    setFill([255, 244, 244]);
    pdf.roundedRect(margin, top, contentW, 28, 3, 3, "F");
    setText([150, 50, 50]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(note, margin + 8, top + 16);
    return top + 34;
  };

  const placeEmbed = async (
    embed: Embed,
    top: number,
    maxH: number,
    label?: string
  ): Promise<number> => {
    if (embed.kind === "image") {
      return drawImageBlock(embed.dataUrl, embed.w, embed.h, top, maxH, label);
    }
    if (embed.kind === "pdf-pages") {
      let cursor = top;
      for (let i = 0; i < embed.pages.length; i++) {
        const page = embed.pages[i];
        const pageLabel =
          embed.pages.length > 1 ? `${label || "Documento"} · pág. ${i + 1}` : label || "Documento";
        if (i > 0) {
          // nueva página para páginas adicionales del PDF
          return -1; // signal caller to handle multi-page - we'll handle in renderTask
        }
        cursor = drawImageBlock(page.dataUrl, page.w, page.h, cursor, maxH, pageLabel);
      }
      return cursor;
    }
    if (embed.kind === "link") return drawLinkCard(embed.url, embed.host, top);
    if (embed.kind === "video") {
      setFill(CARD);
      pdf.roundedRect(margin, top, contentW, 36, 4, 4, "F");
      setText(INK);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Evidencia en video", margin + 10, top + 16);
      setText(MUTED);
      pdf.setFontSize(8);
      pdf.text("Incluida en el almacenamiento del evento.", margin + 10, top + 26);
      return top + 42;
    }
    return drawMissingCard(embed.note, top);
  };

  const renderTaskPages = async (
    t: Task,
    idx: number,
    total: number,
    section: string
  ) => {
    const items: { url: string; kind?: string | null }[] = listEvidencias(t).map((e: EvidenceItem) => ({
      url: e.url,
      kind: e.kind,
    }));
    if (!items.length && t.evidencia_url) {
      items.push({ url: t.evidencia_url, kind: t.media_type });
    }
    if (isStandRecepcion(t) && t.acta_recepcion_url) {
      // acta se renderiza aparte
    }

    const headerRight = `${idx} / ${total}  ·  ${section}`;
    newContentPage(opts.sponsorName, headerRight);

    y = 30;
    setText(INK);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    const titleLines = pdf.splitTextToSize(benefitTitle(t), contentW);
    pdf.text(titleLines, margin, y);
    y += titleLines.length * 6.5 + 2;

    const metaBits = [
      isMillaExtra(t) ? "Milla extra" : null,
      t.dia,
      t.hora,
      t.stage,
      t.speaker,
    ].filter(Boolean);
    if (metaBits.length) {
      setText(MUTED);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(metaBits.join("  ·  "), margin, y);
      y += 7;
    }

    if (isStandRecepcion(t)) {
      setFill(CARD);
      pdf.roundedRect(margin, y, contentW, 22, 3, 3, "F");
      setText(INK);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text("RECEPCIÓN DE STAND", margin + 6, y + 7);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      setText(MUTED);
      pdf.text(
        `Firmante: ${t.firma_nombre || "—"}  ·  CTW ${formatEntregaBogota(t.entrega_ctw_at)}  ·  Sponsor ${formatEntregaBogota(t.entrega_sponsor_at)}`,
        margin + 6,
        y + 15
      );
      y += 28;
    }

    // First visual gets the hero space
    const photoItems = items.filter((i) => i.kind !== "link");
    const primary = photoItems[0] || items[0];
    const rest = items.filter((i) => i !== primary);

    if (primary) {
      const embed = await resolveEmbed(primary.url, primary.kind);
      const maxH = usableBottom - y - 4;

      if (embed.kind === "pdf-pages") {
        for (let pi = 0; pi < embed.pages.length; pi++) {
          if (pi > 0) {
            paintFooter(`${idx}/${total}`);
            newContentPage(opts.sponsorName, `${headerRight} · PDF ${pi + 1}`);
            y = 30;
            setText(INK);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(12);
            pdf.text(benefitTitle(t), margin, y);
            y += 8;
          }
          const page = embed.pages[pi];
          y = drawImageBlock(
            page.dataUrl,
            page.w,
            page.h,
            y,
            usableBottom - y - 4,
            embed.pages.length > 1 ? `Documento · página ${pi + 1}` : "Documento"
          );
        }
      } else {
        y = await placeEmbed(embed, y, maxH, embed.kind === "image" ? undefined : undefined);
      }
    }

    // Remaining items - new pages if image/pdf, cards if links
    for (const item of rest) {
      const embed = await resolveEmbed(item.url, item.kind);
      if (embed.kind === "link") {
        if (y > usableBottom - 48) {
          paintFooter(`${idx}/${total}`);
          newContentPage(opts.sponsorName, headerRight);
          y = 30;
        }
        y = drawLinkCard(embed.url, embed.host, y);
        continue;
      }
      paintFooter(`${idx}/${total}`);
      newContentPage(opts.sponsorName, headerRight);
      y = 30;
      setText(INK);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(benefitTitle(t), margin, y);
      y += 8;
      if (embed.kind === "pdf-pages") {
        for (let pi = 0; pi < embed.pages.length; pi++) {
          if (pi > 0) {
            paintFooter(`${idx}/${total}`);
            newContentPage(opts.sponsorName, `${headerRight} · PDF ${pi + 1}`);
            y = 30;
          }
          const page = embed.pages[pi];
          y = drawImageBlock(page.dataUrl, page.w, page.h, y, usableBottom - y - 4, `Documento · pág. ${pi + 1}`);
        }
      } else if (embed.kind === "image") {
        y = drawImageBlock(embed.dataUrl, embed.w, embed.h, y, usableBottom - y - 4);
      } else {
        y = await placeEmbed(embed, y, usableBottom - y - 4);
      }
    }

    // Acta en página propia a tamaño grande
    if (isStandRecepcion(t) && t.acta_recepcion_url) {
      paintFooter(`${idx}/${total}`);
      newContentPage(opts.sponsorName, `${headerRight} · Acta`);
      y = 30;
      setText(INK);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text("Acta de recepción firmada", margin, y);
      y += 8;
      setText(MUTED);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`Firmante: ${t.firma_nombre || "—"}`, margin, y);
      y += 8;
      const actaEmbed = await resolveEmbed(t.acta_recepcion_url, "photo");
      if (actaEmbed.kind === "image") {
        drawImageBlock(actaEmbed.dataUrl, actaEmbed.w, actaEmbed.h, y, usableBottom - y - 4);
      } else {
        await placeEmbed(actaEmbed, y, usableBottom - y - 4);
      }
    }

    paintFooter(`${idx}/${total}`);
  };

  // ——— Evidencias por fase ———
  let globalIdx = 0;
  const totalEv = buckets.withEvidence.length;

  for (const fase of FASES) {
    const list = buckets.byFaseContractual[fase];
    if (!list.length) continue;

    // Divider page
    pdf.addPage();
    setFill(BLACK);
    pdf.rect(0, 0, pageW, pageH, "F");
    setFill(GREEN);
    pdf.rect(0, 0, pageW, 5, "F");
    setText([130, 130, 130]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("03  /  EVIDENCIAS ENTREGADAS", margin, 40);
    setText(GREEN);
    pdf.setFontSize(28);
    pdf.text(FASE_LABEL[fase], margin, 70);
    setText([180, 180, 180]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text(
      `${list.length} evidencia${list.length === 1 ? "" : "s"} en esta fase`,
      margin,
      84
    );

    for (const t of list) {
      globalIdx += 1;
      await renderTaskPages(t, globalIdx, totalEv, FASE_LABEL[fase]);
    }
  }

  // ——— Milla extra ———
  if (buckets.millaExtraWithEvidence.length) {
    pdf.addPage();
    setFill(BLACK);
    pdf.rect(0, 0, pageW, pageH, "F");
    setFill(GREEN);
    pdf.rect(0, 0, pageW, 5, "F");
    setText(GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("EXTRA  /  MÁS ALLÁ DEL CONTRATO", margin, 40);
    setText([255, 255, 255]);
    pdf.setFontSize(22);
    const mile = pdf.splitTextToSize(
      "Desde Customer Success damos una milla extra por ti",
      contentW
    );
    pdf.text(mile, margin, 62);
    setText([170, 170, 170]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("Beneficios que entregamos más allá de lo contratado.", margin, 62 + mile.length * 9 + 8);

    for (const t of buckets.millaExtraWithEvidence) {
      globalIdx += 1;
      await renderTaskPages(t, globalIdx, totalEv, "Milla extra");
    }
  }

  // ——— Cierre ———
  pdf.addPage();
  setFill(BLACK);
  pdf.rect(0, 0, pageW, pageH, "F");
  setFill(GREEN);
  pdf.rect(0, 0, pageW, 5, "F");
  pdf.rect(0, pageH - 5, pageW, 5, "F");
  setText([235, 235, 235]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  const goodbye = pdf.splitTextToSize(
    "¡Gracias por sumarte al sueño de poner a Colombia en el mapa por su talento, su ecosistema tech y la visión de un país que adopta la tecnología con propósito!",
    contentW
  );
  pdf.text(goodbye, margin, 70);
  setText(GREEN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(opts.sponsorName, margin, 70 + goodbye.length * 7 + 16);
  setText([140, 140, 140]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Generado por ${short} · Colombia Tech Week`, margin, pageH - 28);
  pdf.text(`Actualizado ${formatReportDateTime(updatedAt)}`, margin, pageH - 20);

  return pdf.output("blob");
}
