import { supabase } from "@/integrations/supabase/client";

const BUCKET = "evidencias";

/** Extrae el path del objeto en el bucket a partir de una URL pública o path crudo. */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Ya es un path relativo del bucket
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes("://")) {
    return trimmed.replace(/^\/+/, "");
  }

  const match = trimmed.match(/\/storage\/v1\/object\/public\/evidencias\/(.+?)(?:\?|$)/i)
    || trimmed.match(/\/evidencias\/(.+?)(?:\?|$)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return null;
}

export function isSupabaseEvidencia(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.includes("/storage/v1/object/") ||
    url.includes("/evidencias/") ||
    !!storagePathFromUrl(url)
  ) && !/drive\.google\.com|docs\.google\.com/i.test(url);
}

async function deleteStorageObject(urlOrPath: string | null | undefined) {
  const path = storagePathFromUrl(urlOrPath);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    // No bloquear el flujo si el archivo ya no existe
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
  // Quitar archivo anterior del storage (si era nuestro)
  if (previousUrl && isSupabaseEvidencia(previousUrl)) {
    await deleteStorageObject(previousUrl);
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
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

  const mediaType = file.type.startsWith("video/")
    ? "video"
    : file.type === "application/pdf"
      ? "pdf"
      : "photo";

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
    // Rollback del archivo si falla el update
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
