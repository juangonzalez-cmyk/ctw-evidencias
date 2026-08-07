import { useRef, useState } from "react";
import { Camera, Video, CheckCircle2, Clock, AlertTriangle, RotateCw, Loader2, ImageIcon, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";
import { STATUS } from "@/hooks/useTasks";
import { uploadEvidencia } from "@/lib/upload";
import { supabase } from "@/integrations/supabase/client";
import { useEvent } from "@/context/EventContext";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

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
  // Compara solo hora del día actual (fechas textuales varían por evento)
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
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [showBrandConfirm, setShowBrandConfirm] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [savingBrands, setSavingBrands] = useState(false);

  const isVideo = (task as any).media_type === "video";
  const late = isLate(task);
  const meta = STATUS_META[task.status] ?? STATUS_META[STATUS.PENDING];
  const canUpload = task.status === STATUS.PENDING || task.status === STATUS.REJECTED || task.status === STATUS.REVIEW;
  const mencion = isMencionMC(task);

  // For mención tasks: completed = has video + at least 1 brand captured
  const mencionComplete = mencion && task.evidencia_url && (task.captured_brands?.length ?? 0) > 0;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const subido = relevoOf
        ? `${uploaderName} (relevo de ${relevoOf})`
        : uploaderName;
      await uploadEvidencia(task.id, file, subido, event?.id);

      if (mencion) {
        // Show brand confirmation screen instead of instant success
        setSelectedBrands(task.captured_brands ?? []);
        setShowBrandConfirm(true);
        toast.info("Video subido. Marca las marcas capturadas.", { description: task.marca });
      } else {
        setJustDone(true);
        toast.success(isVideo ? "¡Video subido!" : "¡Foto subida!", { description: task.marca });
        setTimeout(() => setJustDone(false), 1500);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al subir", { description: (err as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
      toast.success("¡Marcas confirmadas!", { description: `${selectedBrands.length} marcas capturadas` });
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

  return (
    <div
      className={cn(
        "card-task relative overflow-hidden",
        late && "card-late pulse-late"
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept={isVideo ? "video/*" : "image/*"}
        capture={isVideo ? "environment" : "environment"}
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={isVideo ? "video/*" : "image/*"}
        onChange={handleFile}
        className="hidden"
      />

      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                isVideo ? "bg-fuchsia-500/15 text-fuchsia-700" : "bg-sky-500/15 text-sky-700"
              )}
            >
              {isVideo ? <Video className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
              {isVideo ? "Video" : "Foto"}
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

      {/* Brand chips for Mención MC */}
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

      {/* Brand capture progress for mentions with video */}
      {mencion && task.evidencia_url && !showBrandConfirm && (
        <div className="text-xs mb-2 flex items-center gap-2">
          <span className="font-semibold">
            Marcas capturadas: {task.captured_brands?.length ?? 0}/{task.brands!.length}
          </span>
          {!mencionComplete && (
            <button
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

      <div className="flex items-center gap-2 mt-2">
        {task.evidencia_url && (
          <a
            href={task.evidencia_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary font-medium px-3 py-2 bg-primary/10 rounded-lg hover:bg-primary/20"
          >
            {isVideo ? <PlayCircle className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
            {isVideo ? "Ver video" : "Ver foto"}
          </a>
        )}

        {canUpload && (
          <div className="flex-1 flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl text-primary-foreground gradient-primary disabled:opacity-50 active:scale-95 transition-transform"
              )}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : task.status === STATUS.REJECTED ? (
                <>
                  <RotateCw className="w-4 h-4" /> Reintentar
                </>
              ) : isVideo ? (
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
              onClick={() => galleryRef.current?.click()}
              disabled={uploading}
              className="px-3 py-3 rounded-xl text-xs font-semibold bg-accent text-accent-foreground disabled:opacity-50"
              title="Elegir de galería"
            >
              Galería
            </button>
          </div>
        )}
      </div>

      {task.subido_por && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Subido por {task.subido_por}
          {task.hora_subida && ` · ${new Date(task.hora_subida).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}

      {/* Brand confirmation overlay */}
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
              onClick={() => setShowBrandConfirm(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-muted-foreground"
            >
              Cancelar
            </button>
            <button
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
    </div>
  );
};
