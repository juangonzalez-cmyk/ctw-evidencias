import { supabase } from "@/integrations/supabase/client";

const BUCKET = "evidencias";
const MAX_BYTES = 50 * 1024 * 1024;

const DOC_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
]);

const DOC_MIME =
  /^(application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|csv|octet-stream)|text\/(plain|csv))$/i;

export const EVIDENCIA_ACCEPT =
  "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Extrae el path del objeto en el bucket a partir de una URL pública o path crudo. */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes("://")) {
    return trimmed.replace(/^\/+/, "");
  }

  const match =
    trimmed.match(/\/storage\/v1\/object\/public\/evidencias\/(.+?)(?:\?|$)/i) ||
    trimmed.match(/\/evidencias\/(.+?)(?:\?|$)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return null;
}

export function isSupabaseEvidencia(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    (url.includes("/storage/v1/object/") ||
      url.includes("/evidencias/") ||
      !!storagePathFromUrl(url)) &&
    !/drive\.google\.com|docs\.google\.com/i.test(url)
  );
}

export function fileExt(nameOrUrl: string): string {
  const clean = nameOrUrl.split("?")[0];
  const parts = clean.split(".");
  return (parts.length > 1 ? parts.pop()! : "").toLowerCase();
}

export function detectMediaType(file: File): "photo" | "video" | "pdf" | "document" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "photo";
  const ext = fileExt(file.name);
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (DOC_EXT.has(ext) || DOC_MIME.test(file.type)) return "document";
  if (ext.match(/^(jpe?g|png|gif|webp|avif|heic)$/)) return "photo";
  if (ext.match(/^(mp4|webm|mov|m4v)$/)) return "video";
  return "document";
}

export function isAllowedEvidenceFile(file: File): boolean {
  if (file.size > MAX_BYTES) return false;
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return true;
  if (DOC_MIME.test(file.type)) return true;
  return DOC_EXT.has(fileExt(file.name)) || /\.(jpe?g|png|gif|webp|avif|heic|mp4|webm|mov|m4v)$/i.test(file.name);
}

export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.pdf(\?|$)/i.test(url);
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isVideoUrl(url) || isPdfUrl(url)) return false;
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt)(\?|$)/i.test(url)) return false;
  return /\.(jpe?g|png|gif|webp|avif|heic)(\?|$)/i.test(url);
}

export function isDocumentUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return isPdfUrl(url) || /\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt)(\?|$)/i.test(url);
}

async function deleteStorageObject(urlOrPath: string | null | undefined) {
  const path = storagePathFromUrl(urlOrPath);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn("No se pudo borrar archivo anterior:", error.message);
  }
}

export async function uploadEvidencia(
  taskId: string,
  file: File,
  uploaderName: string,
  eventId?: string,
  previousUrl?: string | null
) {
  if (!isAllowedEvidenceFile(file)) {
    throw new Error(
      "Tipo no permitido. Usa foto, video, PDF, Word, Excel o PowerPoint (máx. 50 MB)."
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error("El archivo supera 50 MB");
  }

  if (previousUrl && isSupabaseEvidencia(previousUrl)) {
    await deleteStorageObject(previousUrl);
  }

  const ext =
    fileExt(file.name).replace(/[^a-z0-9]/g, "") ||
    (file.type.startsWith("image/") ? "jpg" : "bin");
  const folder = eventId ? `${eventId}/${taskId}` : taskId;
  const path = `${folder}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = urlData.publicUrl;
  const mediaType = detectMediaType(file);

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      evidencia_url: publicUrl,
      media_type: mediaType,
      subido_por: uploaderName,
      hora_subida: new Date().toISOString(),
      status: "por_validar",
      rejected_at: null,
      approved_at: null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (updateError) {
    await deleteStorageObject(path);
    throw updateError;
  }

  return publicUrl;
}

export async function removeEvidencia(taskId: string, currentUrl: string | null | undefined) {
  if (currentUrl && isSupabaseEvidencia(currentUrl)) {
    await deleteStorageObject(currentUrl);
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      evidencia_url: null,
      subido_por: null,
      hora_subida: null,
      status: "pendiente",
      rejected_at: null,
      approved_at: null,
      captured_brands: null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) throw error;
}
