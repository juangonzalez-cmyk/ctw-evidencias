import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";

interface TaskRow {
  id: string;
  marca: string;
  tipo_beneficio: string;
  dia: string | null;
  stage: string | null;
  evidencia_url: string | null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : ".bin";
}

export type DownloadProgress = {
  current: number;
  total: number;
  done: boolean;
  successCount: number;
  failCount: number;
  failures: string[];
  message: string;
  phase: "preparing" | "downloading" | "compressing" | "done";
  zipPart?: number;
  compressionPercent?: number;
};

type EvidenceFile = {
  task: TaskRow;
  originalName: string;
  path: string;
  indexInTask: number;
  totalInTask: number;
  estimatedSize: number;
};

const MAX_FILES_PER_ZIP = 50;
const MAX_ZIP_SIZE_BYTES = 500 * 1024 * 1024;

export async function downloadAllEvidencias(
  onProgress: (p: DownloadProgress) => void,
  options: {
    fase?: "pre_evento" | "durante_evento" | "post_evento" | null;
    eventId?: string | null;
  } = {}
) {
  const failures: string[] = [];
  const emit = (progress: Partial<DownloadProgress>) => {
    onProgress({
      current: 0,
      total: 0,
      done: false,
      successCount: 0,
      failCount: failures.length,
      failures,
      message: "Preparando descarga…",
      phase: "preparing",
      ...progress,
    });
  };

  emit({ message: "Consultando evidencias…", phase: "preparing" });

  // 1. Fetch tasks with evidence
  let q = supabase
    .from("tasks")
    .select("id, marca, tipo_beneficio, dia, stage, evidencia_url, fase")
    .not("evidencia_url", "is", null)
    .is("rejected_at", null)
    .is("deleted_at", null)
    .limit(2000);
  if (options.eventId) q = q.eq("event_id", options.eventId);
  if (options.fase) q = q.eq("fase", options.fase);
  const { data: tasks, error } = await q;

  if (error) throw new Error(`Error consultando tareas: ${error.message}`);
  if (!tasks || tasks.length === 0) throw new Error("No hay evidencias para descargar.");

  const evidenceFiles: EvidenceFile[] = [];
  for (const taskData of tasks) {
    const task = taskData as TaskRow;
    try {
      // List files in the task's folder
      const { data: files, error: listError } = await supabase.storage
        .from("evidencias")
        .list(task.id);

      if (listError || !files || files.length === 0) {
        const path = getEvidencePath(task);
        if (path) {
          evidenceFiles.push({
            task,
            originalName: path.split("/").pop() || "file",
            path,
            indexInTask: 0,
            totalInTask: 1,
            estimatedSize: 0,
          });
        }
        continue;
      }

      const validFiles = files.filter((file) => file.name !== ".emptyFolderPlaceholder");
      validFiles.forEach((file, index) => {
        const metadata = file.metadata as { size?: number } | null;
        evidenceFiles.push({
          task,
          originalName: file.name,
          path: `${task.id}/${file.name}`,
          indexInTask: index,
          totalInTask: validFiles.length,
          estimatedSize: metadata?.size || 0,
        });
      });
    } catch (err) {
      console.warn("Error listando evidencias:", task.id, err);
      failures.push(task.marca);
    }
  }

  if (evidenceFiles.length === 0) throw new Error("No hay archivos de evidencia para descargar.");

  const today = new Date().toISOString().slice(0, 10);
  const zipParts = splitIntoZipParts(evidenceFiles);
  let successCount = 0;
  let processedCount = 0;

  for (let partIndex = 0; partIndex < zipParts.length; partIndex++) {
    const zip = new JSZip();
    const part = zipParts[partIndex];

    for (const file of part) {
      const zipFileName = getZipFileName(file.task, file.originalName, file.indexInTask, file.totalInTask);
      const sizeKB = file.estimatedSize ? Math.round(file.estimatedSize / 1024) : 0;
      emit({
        current: processedCount + 1,
        total: evidenceFiles.length,
        successCount,
        phase: "downloading",
        zipPart: partIndex + 1,
        message: `Descargando archivo ${processedCount + 1} de ${evidenceFiles.length}: ${zipFileName}`,
      });
      console.log(`[${processedCount + 1}/${evidenceFiles.length}] Descargando: ${zipFileName} (${sizeKB} KB)`);

      try {
        let blob: Blob | null = await downloadFile(file.path);
        if (!blob) throw new Error("Archivo no disponible");

        console.log(`[${processedCount + 1}/${evidenceFiles.length}] Procesado: ${zipFileName} (${Math.round(blob.size / 1024)} KB)`);
        zip.file(zipFileName, blob, { compression: "STORE" });
        blob = null;
        successCount++;
      } catch (err) {
        console.warn(`Error descargando ${zipFileName}:`, err);
        failures.push(zipFileName);
      } finally {
        processedCount++;
      }
    }

    if (Object.keys(zip.files).length === 0) continue;

    emit({
      current: processedCount,
      total: evidenceFiles.length,
      successCount,
      phase: "compressing",
      zipPart: partIndex + 1,
      message: `Comprimiendo ZIP parte ${partIndex + 1}: 0%…`,
      compressionPercent: 0,
    });

    let zipBlob: Blob | null = await zip.generateAsync(
      {
        type: "blob",
        streamFiles: true,
        compression: "STORE",
      },
      (metadata) => {
        const percent = Math.round(metadata.percent);
        emit({
          current: processedCount,
          total: evidenceFiles.length,
          successCount,
          phase: "compressing",
          zipPart: partIndex + 1,
          message: `Comprimiendo ZIP parte ${partIndex + 1}: ${percent}%…`,
          compressionPercent: percent,
        });
      }
    );

    const partSuffix = zipParts.length > 1 ? `_parte${partIndex + 1}` : "";
    const faseSuffix = options.fase ? `_${options.fase}` : "";
    emit({
      current: processedCount,
      total: evidenceFiles.length,
      successCount,
      phase: "done",
      zipPart: partIndex + 1,
      message: "Listo - iniciando descarga",
    });
    saveAs(zipBlob, `evidencias_ctw${faseSuffix}_${today}${partSuffix}.zip`);
    zipBlob = null;
  }

  onProgress({
    current: evidenceFiles.length,
    total: evidenceFiles.length,
    done: true,
    successCount,
    failCount: failures.length,
    failures,
    message: "Listo - iniciando descarga",
    phase: "done",
  });
}

function getEvidencePath(task: TaskRow): string | null {
  if (!task.evidencia_url) return null;
  let path = task.evidencia_url;
  const bucketMatch = path.match(/evidencias\/(.+)$/);
  if (bucketMatch) path = bucketMatch[1];
  return path;
}

function getZipFileName(
  task: TaskRow,
  originalName: string,
  indexInTask: number,
  totalInTask: number
): string {
  // Determine folder: stage or tipo_beneficio
  const folder = sanitizeFileName(task.stage || task.tipo_beneficio || "Otros");

  // Base name
  const baseName = sanitizeFileName(
    `${task.marca} - ${task.tipo_beneficio} - ${task.dia || "sin fecha"}`
  );

  const ext = getExtension(originalName);
  const suffix = totalInTask > 1 ? ` (${indexInTask + 1})` : "";
  return `${folder}/${baseName}${suffix}${ext}`;
}

function splitIntoZipParts(files: EvidenceFile[]): EvidenceFile[][] {
  const parts: EvidenceFile[][] = [];
  let currentPart: EvidenceFile[] = [];
  let currentSize = 0;

  for (const file of files) {
    const nextSize = currentSize + file.estimatedSize;
    const shouldStartNewPart =
      currentPart.length > 0 &&
      (currentPart.length >= MAX_FILES_PER_ZIP || nextSize > MAX_ZIP_SIZE_BYTES);

    if (shouldStartNewPart) {
      parts.push(currentPart);
      currentPart = [];
      currentSize = 0;
    }

    currentPart.push(file);
    currentSize += file.estimatedSize;
  }

  if (currentPart.length > 0) parts.push(currentPart);
  return parts;
}

async function downloadFile(path: string): Promise<Blob | null> {
  const downloadPromise = supabase.storage.from("evidencias").download(path);
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("Timeout descargando archivo")), 90_000);
  });

  const { data, error } = await Promise.race([downloadPromise, timeoutPromise]);
  if (error || !data) return null;
  return data;
}
