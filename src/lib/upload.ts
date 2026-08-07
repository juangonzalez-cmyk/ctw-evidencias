import { supabase } from "@/integrations/supabase/client";

export async function uploadEvidencia(
  taskId: string,
  file: File,
  uploaderName: string,
  eventId?: string
) {
  const ext = file.name.split(".").pop() || "jpg";
  const folder = eventId ? `${eventId}/${taskId}` : taskId;
  const path = `${folder}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("evidencias")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      evidencia_url: publicUrl,
      subido_por: uploaderName,
      hora_subida: new Date().toISOString(),
      status: "por_validar",
    })
    .eq("id", taskId);

  if (updateError) throw updateError;

  return publicUrl;
}
