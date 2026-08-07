import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Video,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  Loader2,
  ImageIcon,
  Trash2,
  RefreshCw,
  FileCheck2,
  ExternalLink,
  FileText,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";
import { STATUS } from "@/hooks/useTasks";
import {
  uploadEvidencia,
  removeEvidencia,
  removeActaRecepcion,
  updateStandEntregas,
  isSupabaseEvidencia,
  isImageUrl,
  isVideoUrl,
  isPdfUrl,
  isDocumentUrl,
  fileExt,
  EVIDENCIA_ACCEPT,
} from "@/lib/upload";
import { supabase } from "@/integrations/supabase/client";
import { useEvent } from "@/context/EventContext";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { StandRecepcionModal } from "@/components/StandRecepcionModal";
import {
  STAND_DATETIME_STEP_SECONDS,
  formatEntregaBogota,
  fromDatetimeLocalValue,
  hasActaRecepcion,
  hasPhotoEvidence,
  isStandRecepcion,
  isStandRecepcionComplete,
  snapDatetimeLocalToHalfHour,
  toDatetimeLocalValue,
} from "@/lib/standRecepcion";

interface Props {
  task: Task;
  uploaderName: string;
  relevoOf?: string;
}

const isLate = (task: Task): boolean => {
  if (!task.is_timed || !task.dia || !task.hora) return false;
  if (task.evidencia_url) return false;
  if (task.hora.toLowerCase().includes("confirmar")) return false;
  const [hh, mm] = task.hora.split(":").map(Number);
  if (isNaN(hh)) return false;
  const now = new Date();
  const target = new Date();
  target.setHours(hh, mm || 0, 0, 0);
  return now > target;
};

const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  [STATUS.PENDING]: { label: "Pendiente", cls: "bg-pending/20 text-muted-foreground", icon: "⬜" },
  [STATUS.REVIEW]: { label: "Subido", cls: "bg-success/20 text-success", icon: "📤" },
  [STATUS.APPROVED]: { label: "Aprobado", cls: "bg-success/20 text-success", icon: "✅" },
  [STATUS.REJECTED]: { label: "Rechazado", cls: "bg-destructive/20 text-destructive", icon: "🔴" },
};

const isMencionMC = (task: Task) => !!(task.brands && task.brands.length > 0);

export const TaskCard = ({ task, uploaderName, relevoOf }: Props) => {
  const { event } = useEvent();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [showBrandConfirm, setShowBrandConfirm] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [savingBrands, setSavingBrands] = useState(false);
  const [showFirma, setShowFirma] = useState(false);
  const [ctwLocal, setCtwLocal] = useState(() => toDatetimeLocalValue(task.entrega_ctw_at));
  const [sponsorLocal, setSponsorLocal] = useState(() =>
    toDatetimeLocalValue(task.entrega_sponsor_at)
  );
  const [savingTimes, setSavingTimes] = useState(false);

  const stand = isStandRecepcion(task);
  const url = task.evidencia_url || "";
  const isVideo = task.media_type === "video" || (!!url && isVideoUrl(url));
  const isDoc =
    task.media_type === "pdf" ||
    task.media_type === "document" ||
    (!!url && isDocumentUrl(url));
  const late = isLate(task);
  const meta = STATUS_META[task.status] ?? STATUS_META[STATUS.PENDING];
  const approved = task.status === STATUS.APPROVED;
  const hasEvidence = !!(url && url.trim());
  const hasActa = hasActaRecepcion(task);
  const storedDoc = isSupabaseEvidencia(url);
  const canEditEvidence =
    !approved &&
    (task.status === STATUS.PENDING ||
      task.status === STATUS.REJECTED ||
      task.status === STATUS.REVIEW);
  const mencion = isMencionMC(task);
  const mencionComplete = mencion && hasEvidence && (task.captured_brands?.length ?? 0) > 0;
  const preferVideoCapture = !stand && task.media_type === "video";
  const standComplete = stand && isStandRecepcionComplete(task);

  useEffect(() => {
    const active = document.activeElement?.getAttribute("data-stand-field");
    if (active === "ctw" || active === "sponsor") return;
    setCtwLocal(toDatetimeLocalValue(task.entrega_ctw_at));
    setSponsorLocal(toDatetimeLocalValue(task.entrega_sponsor_at));
  }, [task.id, task.entrega_ctw_at, task.entrega_sponsor_at]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (stand && !file.type.startsWith("image/") && !/\.(jpe?g|png|gif|webp|heic)$/i.test(file.name)) {
      toast.warning("Para stands sube una foto del stand");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const subido = relevoOf
        ? `${uploaderName} (relevo de ${relevoOf})`
        : uploaderName;
      await uploadEvidencia(task.id, file, subido, event?.id, task.evidencia_url);

      if (mencion) {
        setSelectedBrands(task.captured_brands ?? []);
        setShowBrandConfirm(true);
        toast.info("Archivo guardado. Marca las marcas capturadas.", {
          description: task.marca,
        });
      } else {
        setJustDone(true);
        toast.success(hasEvidence ? "Evidencia reemplazada" : stand ? "Foto del stand guardada" : "Evidencia guardada", {
          description: file.name,
        });
        setTimeout(() => setJustDone(false), 1200);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al subir", { description: (err as Error).message });
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
      if (docRef.current) docRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (approved || !hasEvidence) return;
    if (!confirm("¿Quitar esta evidencia? Podrás subir otra después.")) return;
    setRemoving(true);
    try {
      await removeEvidencia(task.id, task.evidencia_url);
      toast.success("Evidencia eliminada");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo quitar", { description: (err as Error).message });
    } finally {
      setRemoving(false);
    }
  };

  const handleRemoveActa = async () => {
    if (approved || !hasActa) return;
    if (!confirm("¿Quitar el acta firmada? Podrás pedir la firma de nuevo.")) return;
    setRemoving(true);
    try {
      await removeActaRecepcion(task.id, task.acta_recepcion_url);
      toast.success("Acta eliminada");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo quitar el acta", { description: (err as Error).message });
    } finally {
      setRemoving(false);
    }
  };

  const handleSaveTimes = async () => {
    setSavingTimes(true);
    try {
      const ctw = fromDatetimeLocalValue(ctwLocal);
      const sp = fromDatetimeLocalValue(sponsorLocal);
      await updateStandEntregas(task.id, ctw, sp);
      toast.success("Horarios de entrega guardados");
      if (ctw && sp && hasPhotoEvidence(task) && hasActa) {
        setJustDone(true);
        setTimeout(() => setJustDone(false), 1200);
      }
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron guardar los horarios", {
        description: (err as Error).message,
      });
      setCtwLocal(toDatetimeLocalValue(task.entrega_ctw_at));
      setSponsorLocal(toDatetimeLocalValue(task.entrega_sponsor_at));
    } finally {
      setSavingTimes(false);
    }
  };

  const handleBrandToggle = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  const handleSaveBrands = async () => {
    if (selectedBrands.length === 0) {
      toast.warning("Selecciona al menos una marca capturada");
      return;
    }
    setSavingBrands(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ captured_brands: selectedBrands })
        .eq("id", task.id);
      if (error) throw error;
      toast.success("¡Marcas confirmadas!", {
        description: `${selectedBrands.length} marcas capturadas`,
      });
      setShowBrandConfirm(false);
      setJustDone(true);
      setTimeout(() => setJustDone(false), 1500);
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar marcas");
    } finally {
      setSavingBrands(false);
    }
  };

  const busy = uploading || removing || savingTimes;
  const kindLabel = stand
    ? "Stand"
    : isVideo
      ? "Video"
      : isDoc
        ? isPdfUrl(url)
          ? "PDF"
          : "Documento"
        : "Foto";
  const KindIcon = stand ? PenLine : isVideo ? Video : isDoc ? FileText : Camera;

  return (
    <div
      className={cn(
        "card-task relative overflow-hidden",
        late && "card-late pulse-late"
      )}
    >
      <input
        ref={cameraRef}
        type="file"
        accept={preferVideoCapture ? "video/*" : "image/*"}
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={preferVideoCapture ? "video/*" : "image/*"}
        onChange={handleFile}
        className="hidden"
      />
      {!stand && (
        <input
          ref={docRef}
          type="file"
          accept={EVIDENCIA_ACCEPT}
          onChange={handleFile}
          className="hidden"
        />
      )}

      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                stand
                  ? "bg-primary/15 text-primary"
                  : isVideo
                    ? "bg-fuchsia-500/15 text-fuchsia-700"
                    : isDoc
                      ? "bg-amber-500/15 text-amber-800"
                      : "bg-sky-500/15 text-sky-700"
              )}
            >
              <KindIcon className="w-3 h-3" />
              {kindLabel}
            </span>
          </div>
          <h3 className="font-bold text-lg leading-tight truncate">{task.marca}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {task.tipo_beneficio}
          </p>
        </div>
        <span
          className={cn(
            "text-[10px] uppercase font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0",
            meta.cls
          )}
        >
          {meta.icon} {meta.label}
        </span>
      </div>

      {mencion && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.brands!.map((brand) => {
            const captured = task.captured_brands?.includes(brand);
            return (
              <span
                key={brand}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  captured
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-secondary text-muted-foreground border-border"
                )}
              >
                🏷 {brand}
              </span>
            );
          })}
        </div>
      )}

      {task.speaker && (
        <p className="text-xs text-muted-foreground italic mb-2 line-clamp-1">
          🎙️ {task.speaker}
        </p>
      )}

      {task.notas && (
        <p className="text-[11px] text-muted-foreground/80 mb-2 line-clamp-2">
          {task.notas}
        </p>
      )}

      {task.is_timed && task.hora && (
        <div
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-bold mb-3 px-2.5 py-1.5 rounded-lg",
            late ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"
          )}
        >
          {late ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
          ⏰ {task.dia} · {task.hora}
          {late && <span className="font-bold ml-1">⚠️ ATRASADA</span>}
        </div>
      )}

      {stand && (
        <div className="mb-3 rounded-xl border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Checklist de recepción
          </p>
          <StandCheck ok={hasEvidence} label="Foto del stand" />
          <StandCheck ok={hasActa} label="Acta firmada por el sponsor" />
          <StandCheck ok={!!task.entrega_ctw_at} label="Hora de entrega a Colombia Tech" />
          <StandCheck ok={!!task.entrega_sponsor_at} label="Hora de entrega al sponsor" />
          {standComplete && (
            <p className="text-[11px] font-semibold text-success pt-1">
              Listo para validación
            </p>
          )}
        </div>
      )}

      {hasEvidence && (
        <div className="mb-3 rounded-xl overflow-hidden border border-border bg-muted/30">
          {isVideo ? (
            <video
              src={url}
              controls
              playsInline
              className="w-full max-h-48 bg-black object-contain"
            />
          ) : isImageUrl(url) ? (
            <img
              src={url}
              alt={`Evidencia ${task.marca}`}
              className="w-full max-h-48 object-cover"
              loading="lazy"
            />
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-4 text-sm font-medium text-primary hover:bg-muted/50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 shrink-0">
                <FileText className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold truncate">
                  {isPdfUrl(url) ? "Documento PDF" : "Documento de soporte"}
                </span>
                <span className="block text-[11px] text-muted-foreground uppercase">
                  .{fileExt(url) || "archivo"} · tocar para abrir
                </span>
              </span>
              <ExternalLink className="w-4 h-4 shrink-0 ml-auto" />
            </a>
          )}
          <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] border-t border-border bg-card">
            {storedDoc ? (
              <>
                <FileCheck2 className="w-3.5 h-3.5 text-success shrink-0" />
                <span className="text-muted-foreground">
                  {stand ? "Foto del stand guardada" : "Guardado como archivo en el evento"}
                </span>
              </>
            ) : (
              <>
                <ExternalLink className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-amber-700 dark:text-amber-400">
                  Link externo — vuelve a subirlo para guardarlo en CTW
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {stand && hasActa && task.acta_recepcion_url && (
        <div className="mb-3 rounded-xl overflow-hidden border border-border bg-muted/30">
          <img
            src={task.acta_recepcion_url}
            alt={`Acta ${task.marca}`}
            className="w-full max-h-56 object-contain bg-white"
            loading="lazy"
          />
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] border-t border-border bg-card">
            <span className="text-muted-foreground truncate">
              Firmó: {task.firma_nombre || "—"}
            </span>
            <a
              href={task.acta_recepcion_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary font-semibold"
            >
              <ExternalLink className="w-3 h-3" /> Abrir
            </a>
          </div>
        </div>
      )}

      {stand && canEditEvidence && (
        <div className="mb-3 space-y-2 rounded-xl border border-border p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Horarios de entrega
          </p>
          <p className="text-[10px] text-muted-foreground">
            Solo cada 30 minutos. Dos stands no pueden compartir la misma hora (CTW o sponsor).
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Entrega a Colombia Tech</span>
            <input
              type="datetime-local"
              data-stand-field="ctw"
              step={STAND_DATETIME_STEP_SECONDS}
              value={ctwLocal}
              onChange={(e) => setCtwLocal(snapDatetimeLocalToHalfHour(e.target.value))}
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Entrega al sponsor</span>
            <input
              type="datetime-local"
              data-stand-field="sponsor"
              step={STAND_DATETIME_STEP_SECONDS}
              value={sponsorLocal}
              onChange={(e) => setSponsorLocal(snapDatetimeLocalToHalfHour(e.target.value))}
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSaveTimes()}
            disabled={busy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-border bg-card hover:bg-muted disabled:opacity-50"
          >
            {savingTimes ? "Guardando…" : "Guardar horarios"}
          </button>
          {(task.entrega_ctw_at || task.entrega_sponsor_at) && (
            <p className="text-[10px] text-muted-foreground">
              CTW: {formatEntregaBogota(task.entrega_ctw_at)} · Sponsor:{" "}
              {formatEntregaBogota(task.entrega_sponsor_at)}
            </p>
          )}
        </div>
      )}

      {stand && !canEditEvidence && (task.entrega_ctw_at || task.entrega_sponsor_at) && (
        <p className="text-[11px] text-muted-foreground mb-2">
          CTW: {formatEntregaBogota(task.entrega_ctw_at)} · Sponsor:{" "}
          {formatEntregaBogota(task.entrega_sponsor_at)}
        </p>
      )}

      {mencion && hasEvidence && !showBrandConfirm && (
        <div className="text-xs mb-2 flex items-center gap-2">
          <span className="font-semibold">
            Marcas capturadas: {task.captured_brands?.length ?? 0}/{task.brands!.length}
          </span>
          {!mencionComplete && canEditEvidence && (
            <button
              type="button"
              onClick={() => {
                setSelectedBrands(task.captured_brands ?? []);
                setShowBrandConfirm(true);
              }}
              className="text-primary underline font-semibold text-[11px]"
            >
              Editar marcas
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-2">
        {stand && canEditEvidence && (
          <>
            {!hasEvidence ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl text-primary-foreground gradient-primary disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-4 h-4" /> Foto del stand
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={busy}
                  className="px-3 py-3 rounded-xl text-xs font-semibold bg-accent text-accent-foreground disabled:opacity-50"
                >
                  Galería
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={busy}
                  className="flex-1 min-w-[7rem] flex items-center justify-center gap-2 font-semibold text-sm py-2.5 rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" /> Cambiar foto
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={busy}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowFirma(true)}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl border border-primary/40 bg-primary/10 text-primary disabled:opacity-50"
            >
              <PenLine className="w-4 h-4" />
              {hasActa ? "Volver a pedir firma" : "Pedir firma al sponsor"}
            </button>
            {hasActa && (
              <button
                type="button"
                onClick={() => void handleRemoveActa()}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-xl text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" /> Quitar acta
              </button>
            )}
          </>
        )}

        {!stand && !hasEvidence && canEditEvidence && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl text-primary-foreground gradient-primary disabled:opacity-50 active:scale-95 transition-transform"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : task.status === STATUS.REJECTED ? (
                  <>
                    <RotateCw className="w-4 h-4" /> Reintentar
                  </>
                ) : preferVideoCapture ? (
                  <>
                    <Video className="w-4 h-4" /> Grabar
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" /> Tomar foto
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={busy}
                className="px-3 py-3 rounded-xl text-xs font-semibold bg-accent text-accent-foreground disabled:opacity-50"
                title="Elegir de galería"
              >
                Galería
              </button>
            </div>
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-2.5 rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Subir documento (PDF, Word…)
            </button>
          </>
        )}

        {!stand && hasEvidence && canEditEvidence && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex-1 min-w-[7rem] flex items-center justify-center gap-2 font-semibold text-sm py-2.5 rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Cambiar
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-accent text-accent-foreground disabled:opacity-50"
            >
              Galería
            </button>
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              disabled={busy}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-border disabled:opacity-50"
              title="Subir documento"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
              title="Quitar evidencia"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        )}

        {hasEvidence && approved && (
          <p className="text-[11px] text-muted-foreground">
            Aprobada — ya no se puede cambiar ni quitar.
          </p>
        )}

        {!stand && !hasEvidence && !canEditEvidence && (
          <a
            href={task.evidencia_url || "#"}
            className="flex items-center gap-1.5 text-xs text-primary font-medium px-3 py-2 bg-primary/10 rounded-lg"
          >
            <ImageIcon className="w-3.5 h-3.5" /> Ver evidencia
          </a>
        )}
      </div>

      {task.subido_por && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Subido por {task.subido_por}
          {task.hora_subida &&
            ` · ${new Date(task.hora_subida).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
        </p>
      )}

      {showBrandConfirm && (
        <div className="absolute inset-0 bg-background/98 rounded-2xl p-4 flex flex-col z-10 overflow-y-auto">
          <h4 className="font-bold text-sm mb-1">¿Qué marcas quedaron capturadas?</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Selecciona las marcas que aparecen en el video
          </p>
          <div className="space-y-2 flex-1">
            {task.brands!.map((brand) => (
              <label key={brand} className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={selectedBrands.includes(brand)}
                  onCheckedChange={() => handleBrandToggle(brand)}
                />
                <span className="text-sm font-medium">{brand}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowBrandConfirm(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveBrands}
              disabled={savingBrands || selectedBrands.length === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold gradient-primary text-primary-foreground disabled:opacity-50"
            >
              {savingBrands ? "Guardando…" : `Confirmar (${selectedBrands.length})`}
            </button>
          </div>
        </div>
      )}

      {justDone && (
        <div className="absolute inset-0 flex items-center justify-center bg-success/95 rounded-2xl">
          <CheckCircle2 className="w-16 h-16 text-white check-burst" />
        </div>
      )}

      <StandRecepcionModal
        open={showFirma}
        task={task}
        uploaderName={
          relevoOf ? `${uploaderName} (relevo de ${relevoOf})` : uploaderName
        }
        onClose={() => setShowFirma(false)}
      />
    </div>
  );
};

function StandCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
          ok ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground"
        )}
      >
        {ok ? "✓" : "·"}
      </span>
      <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </div>
  );
}
