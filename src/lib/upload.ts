import { supabase } from "@/integrations/supabase/client";
import {
  FLUJO_STAND_RECEPCION,
  assertSponsorAfterCtw,
  findStandEntregaConflicts,
  formatStandConflictMessage,
  isStandRecepcion,
  resolveStandStatusAfterEdit,
} from "@/lib/standRecepcion";
import {
  listEvidencias,
  newEvidenceId,
  primaryFields,
  type EvidenceItem,
  type EvidenceKind,
} from "@/lib/evidencias";
import type { Json } from "@/integrations/supabase/types";

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

/** URL http(s) externa usada como evidencia (nota de prensa, Drive, etc.). */
export function isLinkEvidence(
  url: string | null | undefined,
  mediaType?: string | null
): boolean {
  if (mediaType === "link") return true;
  if (!url || !url.trim()) return false;
  if (isSupabaseEvidencia(url)) return false;
  if (isImageUrl(url) || isVideoUrl(url) || isDocumentUrl(url)) return false;
  return /^https?:\/\//i.test(url.trim());
}

export function normalizeEvidenceLink(raw: string): string {
  let u = raw.trim();
  if (!u) throw new Error("Pega un link");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error("Link inválido");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Solo se permiten links http o https");
  }
  return parsed.toString();
}

/** Solo http(s) seguro para href en UI (evita javascript: u otros esquemas). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  const u = (url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function linkDisplayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

async function deleteStorageObject(urlOrPath: string | null | undefined) {
  const path = storagePathFromUrl(urlOrPath);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn("No se pudo borrar archivo anterior:", error.message);
  }
}

type TaskStandFields = {
  flujo: string | null;
  event_id: string | null;
  tipo_beneficio: string | null;
  category: string | null;
  evidencia_url: string | null;
  evidencias?: unknown;
  media_type?: string | null;
  hora_subida?: string | null;
  subido_por?: string | null;
  acta_recepcion_url: string | null;
  entrega_ctw_at: string | null;
  entrega_sponsor_at: string | null;
  status: string | null;
};

async function fetchTaskStandFields(taskId: string): Promise<TaskStandFields | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "flujo, event_id, tipo_beneficio, category, evidencia_url, evidencias, media_type, hora_subida, subido_por, acta_recepcion_url, entrega_ctw_at, entrega_sponsor_at, status"
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    console.warn("No se pudo leer flujo de task:", error.message);
    return null;
  }
  return data as TaskStandFields | null;
}

function evidenciasPayload(items: EvidenceItem[]): Json {
  return items as unknown as Json;
}

async function persistEvidencias(
  taskId: string,
  items: EvidenceItem[],
  uploaderName: string,
  statusPatch: Record<string, unknown>
) {
  const primary = primaryFields(items);
  const { error } = await supabase
    .from("tasks")
    .update({
      evidencias: evidenciasPayload(items),
      evidencia_url: primary.evidencia_url,
      media_type: primary.media_type,
      subido_por: uploaderName,
      hora_subida: new Date().toISOString(),
      edited_at: new Date().toISOString(),
      ...statusPatch,
    })
    .eq("id", taskId);
  if (error) throw error;
  return primary.evidencia_url;
}

function taskIsStandFlow(t: TaskStandFields | null): boolean {
  if (!t) return false;
  return isStandRecepcion({
    flujo: t.flujo,
    tipo_beneficio: t.tipo_beneficio,
    category: t.category,
  });
}

export async function assertStandEntregasAvailable(
  eventId: string,
  taskId: string,
  entregaCtwAt: string | null,
  entregaSponsorAt: string | null
) {
  // No forzamos slots de 10 min en entrega al sponsor: el mínimo es CTW+59 min exactos.
  assertSponsorAfterCtw(entregaCtwAt, entregaSponsorAt);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, marca, tipo_beneficio, entrega_ctw_at, entrega_sponsor_at, deleted_at")
    .eq("event_id", eventId)
    .eq("flujo", FLUJO_STAND_RECEPCION)
    .is("deleted_at", null);

  if (error) throw error;

  const conflict = findStandEntregaConflicts({
    currentTaskId: taskId,
    entregaCtwAt,
    entregaSponsorAt,
    others: data ?? [],
  });
  if (conflict) throw new Error(formatStandConflictMessage(conflict));
}

function resolveStatusAfterPhoto(
  current: TaskStandFields | null,
  evidenciaUrl: string
): { status: string; clearApproved: boolean } {
  if (taskIsStandFlow(current)) {
    return resolveStandStatusAfterEdit(current?.status, {
      evidencia_url: evidenciaUrl,
      acta_recepcion_url: current?.acta_recepcion_url ?? null,
      entrega_ctw_at: current?.entrega_ctw_at ?? null,
      entrega_sponsor_at: current?.entrega_sponsor_at ?? null,
    });
  }
  return { status: "por_validar", clearApproved: false };
}

export async function uploadEvidencia(
  taskId: string,
  file: File,
  uploaderName: string,
  eventId?: string,
  _previousUrl?: string | null
) {
  if (!isAllowedEvidenceFile(file)) {
    throw new Error(
      "Tipo no permitido. Usa foto, video, PDF, Word, Excel o PowerPoint (máx. 50 MB)."
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error("El archivo supera 50 MB");
  }

  const current = await fetchTaskStandFields(taskId);
  if (!current) {
    throw new Error("No se pudo leer el beneficio. Refresca la app e intenta de nuevo.");
  }
  const isStand = taskIsStandFlow(current);
  const existing = listEvidencias(current);

  // Stands: una sola foto principal (reemplaza archivo previo, conserva links si hubiera)
  if (isStand) {
    for (const item of existing.filter((e) => e.kind !== "link" && isSupabaseEvidencia(e.url))) {
      await deleteStorageObject(item.url);
    }
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
  const mediaType = detectMediaType(file) as EvidenceKind;

  const item: EvidenceItem = {
    id: newEvidenceId(),
    url: publicUrl,
    kind: mediaType,
    label: file.name,
    added_at: new Date().toISOString(),
    added_by: uploaderName,
  };

  const next = isStand
    ? [...existing.filter((e) => e.kind === "link"), item]
    : [...existing, item];

  const resolved = resolveStatusAfterPhoto(current, publicUrl);

  try {
    await persistEvidencias(taskId, next, uploaderName, {
      status: resolved.status,
      rejected_at: null,
      ...(resolved.clearApproved || !isStand ? { approved_at: null } : {}),
    });
  } catch (err) {
    await deleteStorageObject(path);
    throw err;
  }

  return publicUrl;
}

export async function saveEvidenciaLink(
  taskId: string,
  rawUrl: string,
  uploaderName: string,
  _previousUrl?: string | null
) {
  const url = normalizeEvidenceLink(rawUrl);
  const current = await fetchTaskStandFields(taskId);
  if (!current) {
    throw new Error("No se pudo leer el beneficio. Refresca la app e intenta de nuevo.");
  }
  if (taskIsStandFlow(current)) {
    throw new Error("En stands la evidencia principal debe ser una foto, no un link.");
  }

  const existing = listEvidencias(current);
  if (existing.some((e) => e.url === url)) {
    throw new Error("Ese link ya está guardado en este beneficio");
  }

  const item: EvidenceItem = {
    id: newEvidenceId(),
    url,
    kind: "link",
    label: linkDisplayHost(url),
    added_at: new Date().toISOString(),
    added_by: uploaderName,
  };
  const next = [...existing, item];

  await persistEvidencias(taskId, next, uploaderName, {
    status: "por_validar",
    rejected_at: null,
    approved_at: null,
  });

  return url;
}

/** Elimina un soporte concreto (archivo o link) sin borrar los demás. */
export async function removeEvidenciaItem(taskId: string, itemId: string) {
  const current = await fetchTaskStandFields(taskId);
  if (!current) {
    throw new Error("No se pudo leer el beneficio. Refresca la app e intenta de nuevo.");
  }
  const existing = listEvidencias(current);
  const target = existing.find((e) => e.id === itemId);
  if (!target) throw new Error("Soporte no encontrado");

  if (isSupabaseEvidencia(target.url)) {
    await deleteStorageObject(target.url);
  }

  const next = existing.filter((e) => e.id !== itemId);
  const isStand = taskIsStandFlow(current);
  const primary = primaryFields(next);

  if (!next.length) {
    const { error } = await supabase
      .from("tasks")
      .update({
        evidencias: [] as unknown as Json,
        evidencia_url: null,
        ...(isStand
          ? {}
          : {
              subido_por: null,
              hora_subida: null,
              captured_brands: null,
            }),
        status: "pendiente",
        rejected_at: null,
        approved_at: null,
        edited_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) throw error;
    return;
  }

  await persistEvidencias(taskId, next, current.subido_por || "sistema", {
    status: primary.evidencia_url ? "por_validar" : "pendiente",
    rejected_at: null,
    approved_at: null,
  });
}

/** Borra TODOS los soportes del beneficio. */
export async function removeEvidencia(taskId: string, _currentUrl?: string | null) {
  const current = await fetchTaskStandFields(taskId);
  if (!current) {
    throw new Error("No se pudo leer el beneficio. Refresca la app e intenta de nuevo.");
  }
  const existing = listEvidencias(current);

  for (const item of existing) {
    if (isSupabaseEvidencia(item.url)) await deleteStorageObject(item.url);
  }

  const isStand = taskIsStandFlow(current);

  const { error } = await supabase
    .from("tasks")
    .update({
      evidencias: [] as unknown as Json,
      evidencia_url: null,
      ...(isStand
        ? {}
        : {
            subido_por: null,
            hora_subida: null,
            captured_brands: null,
          }),
      status: "pendiente",
      rejected_at: null,
      approved_at: null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) throw error;
}

export async function uploadActaRecepcion(
  taskId: string,
  blob: Blob,
  firmaNombre: string,
  uploaderName: string,
  eventId?: string,
  previousUrl?: string | null
) {
  if (blob.size > MAX_BYTES) {
    throw new Error("El acta supera 50 MB");
  }

  if (previousUrl && isSupabaseEvidencia(previousUrl)) {
    await deleteStorageObject(previousUrl);
  }

  const folder = eventId ? `${eventId}/${taskId}` : taskId;
  const path = `${folder}/acta-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/png",
  });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = urlData.publicUrl;
  const current = await fetchTaskStandFields(taskId);
  const resolved = resolveStandStatusAfterEdit(current?.status, {
    evidencia_url: current?.evidencia_url ?? null,
    acta_recepcion_url: publicUrl,
    entrega_ctw_at: current?.entrega_ctw_at ?? null,
    entrega_sponsor_at: current?.entrega_sponsor_at ?? null,
  });

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      flujo: FLUJO_STAND_RECEPCION,
      acta_recepcion_url: publicUrl,
      firma_nombre: firmaNombre.trim() || null,
      subido_por: uploaderName,
      hora_subida: new Date().toISOString(),
      status: resolved.status,
      rejected_at: null,
      ...(resolved.clearApproved ? { approved_at: null } : {}),
      edited_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (updateError) {
    await deleteStorageObject(path);
    throw updateError;
  }

  return publicUrl;
}

export async function removeActaRecepcion(
  taskId: string,
  currentUrl: string | null | undefined
) {
  if (currentUrl && isSupabaseEvidencia(currentUrl)) {
    await deleteStorageObject(currentUrl);
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      acta_recepcion_url: null,
      firma_nombre: null,
      status: "pendiente",
      approved_at: null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) throw error;
}

export async function updateStandEntregas(
  taskId: string,
  entregaCtwAt: string | null,
  entregaSponsorAt: string | null
) {
  const current = await fetchTaskStandFields(taskId);
  if (!current?.event_id) {
    throw new Error("No se encontró el beneficio de stand");
  }

  await assertStandEntregasAvailable(
    current.event_id,
    taskId,
    entregaCtwAt,
    entregaSponsorAt
  );

  const patch = {
    evidencia_url: current.evidencia_url ?? null,
    acta_recepcion_url: current.acta_recepcion_url ?? null,
    entrega_ctw_at: entregaCtwAt,
    entrega_sponsor_at: entregaSponsorAt,
  };
  const updates: Record<string, unknown> = {
    entrega_ctw_at: entregaCtwAt,
    entrega_sponsor_at: entregaSponsorAt,
    edited_at: new Date().toISOString(),
  };

  if (current.flujo !== FLUJO_STAND_RECEPCION && taskIsStandFlow(current)) {
    updates.flujo = FLUJO_STAND_RECEPCION;
  }

  if (taskIsStandFlow(current) || updates.flujo === FLUJO_STAND_RECEPCION) {
    const resolved = resolveStandStatusAfterEdit(current?.status, patch);
    updates.status = resolved.status;
    updates.rejected_at = null;
    if (resolved.clearApproved) updates.approved_at = null;
  }

  const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);

  if (error) throw error;
  return updates.status as string | undefined;
}
