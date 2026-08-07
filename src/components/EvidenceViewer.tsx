import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Download,
  Loader2,
  AlertTriangle,
  Check,
  Trash2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { unifyBrand } from "@/lib/brands";
import { STATUS, type Task } from "@/hooks/useTasks";
import { FASE_BADGE_CLASS, FASE_EMOJI, FASE_LABEL, getFase } from "@/lib/fases";
import { cn } from "@/lib/utils";

type Kind = "image" | "video" | "pdf" | "other";

const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|#|$)/i;
const VID_RE = /\.(mp4|mov|webm|m4v|ogv)(\?|#|$)/i;
const PDF_RE = /\.(pdf)(\?|#|$)/i;

function detectKind(url: string, mediaType?: string | null): Kind {
  if (IMG_RE.test(url)) return "image";
  if (VID_RE.test(url)) return "video";
  if (PDF_RE.test(url)) return "pdf";
  if (mediaType === "video") return "video";
  if (mediaType === "photo") return "image";
  return "other";
}

const BOGOTA_FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const formatBogota = (iso?: string | null) => {
  if (!iso) return "";
  try { return BOGOTA_FMT.format(new Date(iso)); } catch { return ""; }
};

interface Props {
  /** Sibling evidences for navigation (active list, or rejected list if current is rejected). */
  items: Task[];
  current: Task;
  onNavigate: (taskId: string) => void;
  onClose: () => void;
  onApprove: (t: Task) => void;
  onUnapprove: (t: Task) => void;
  onAskReject: (t: Task) => void;
  onAskUndoReject: (t: Task) => void;
  onEdit: (t: Task) => void;
  busy?: boolean;
}

export const EvidenceViewer = ({
  items,
  current,
  onNavigate,
  onClose,
  onApprove,
  onUnapprove,
  onAskReject,
  onAskUndoReject,
  onEdit,
  busy,
}: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [justApprovedLast, setJustApprovedLast] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setJustApprovedLast(false);
  }, [current.id]);

  // Index of current within active list (-1 if current was just rejected).
  const currentIndex = useMemo(
    () => items.findIndex((t) => t.id === current.id),
    [items, current.id],
  );

  // Compute neighbors. If current is in active list: simple prev/next.
  // Otherwise (rejected current still displayed), find nearest neighbors by hora ordering.
  const { prevId, nextId } = useMemo(() => {
    if (items.length === 0) return { prevId: null, nextId: null };
    if (currentIndex !== -1) {
      return {
        prevId: currentIndex > 0 ? items[currentIndex - 1].id : null,
        nextId: currentIndex < items.length - 1 ? items[currentIndex + 1].id : null,
      };
    }
    const horaKey = (t: Task) => `${t.hora || "99:99"}|${t.id}`;
    const cur = horaKey(current);
    let prev: string | null = null;
    let next: string | null = null;
    for (const t of items) {
      const k = horaKey(t);
      if (k < cur) prev = t.id;
      else if (k > cur && next === null) { next = t.id; break; }
    }
    return { prevId: prev, nextId: next };
  }, [items, currentIndex, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && prevId) onNavigate(prevId);
      else if (e.key === "ArrowRight" && nextId) onNavigate(nextId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, onNavigate, onClose]);

  const url = current.evidencia_url || "";
  const kind = useMemo(
    () => detectKind(url, (current as any).media_type),
    [current, url],
  );
  const sponsor = unifyBrand(current.marca);
  const approved = current.status === STATUS.APPROVED && !current.rejected_at;
  const rejected = !!current.rejected_at;
  const hasEvid = !!url.trim() && !rejected;
  const showNav = items.length > 1 || currentIndex === -1;

  const handleApprove = () => {
    const isLast = currentIndex === items.length - 1;
    onApprove(current);
    if (currentIndex !== -1 && !isLast) {
      // Auto-advance to next active
      onNavigate(items[currentIndex + 1].id);
    } else {
      setJustApprovedLast(true);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[90vw] w-[90vw] max-h-[90vh] sm:max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 border-b border-border space-y-1.5 text-left">
          <DialogTitle className="text-2xl font-extrabold leading-tight pr-8">
            {sponsor}
          </DialogTitle>
          <div className="text-sm font-semibold text-foreground/80">
            {current.tipo_beneficio}
          </div>
          <div>
            {(() => {
              const f = getFase(current);
              return (
                <span className={cn(
                  "inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                  FASE_BADGE_CLASS[f],
                )}>
                  {FASE_EMOJI[f]} {FASE_LABEL[f]}
                </span>
              );
            })()}
          </div>
          <DialogDescription className="text-xs flex flex-wrap gap-x-3 gap-y-0.5">
            {current.dia && <span>📅 {current.dia}</span>}
            {current.hora && <span>⏰ {current.hora}</span>}
            {current.stage && <span>🎤 {current.stage}</span>}
            {current.speaker && <span>🗣️ {current.speaker}</span>}
          </DialogDescription>
          <div className="pt-1">
            {approved && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-success/15 text-success">
                ✓ Aprobada {current.approved_at ? `· ${formatBogota(current.approved_at)}` : ""}
              </span>
            )}
            {rejected && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-destructive/15 text-destructive">
                🗑️ Rechazada {current.rejected_at ? `el ${formatBogota(current.rejected_at)}` : ""}
              </span>
            )}
            {!approved && !rejected && hasEvid && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-600">
                ⏳ Por revisar
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-black/5 flex items-center justify-center relative overflow-auto">
          {loading && !error && kind !== "other" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-destructive" />
              <p className="text-sm font-semibold">No se pudo cargar la evidencia</p>
              <Button asChild variant="outline" size="sm">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> Abrir en nueva pestaña
                </a>
              </Button>
            </div>
          ) : kind === "image" ? (
            <img
              key={url}
              src={url}
              alt={current.tipo_beneficio}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              className="max-w-full max-h-[60vh] object-contain"
            />
          ) : kind === "video" ? (
            <video
              key={url}
              src={url}
              controls
              onLoadedData={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              className="max-w-full max-h-[60vh]"
            />
          ) : kind === "pdf" ? (
            <iframe
              key={url}
              src={url}
              title="Evidencia PDF"
              onLoad={() => setLoading(false)}
              className="w-full h-[60vh] bg-background"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold">Formato no previsualizable</p>
              <Button asChild variant="outline" size="sm">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> Abrir en nueva pestaña
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="p-3 border-t border-border bg-muted/30 flex flex-wrap items-center justify-center gap-2">
          {rejected ? (
            <Button
              size="lg"
              disabled={busy}
              onClick={() => onAskUndoReject(current)}
              className="gap-2"
            >
              <RotateCcw className="w-5 h-5" /> Deshacer rechazo
            </Button>
          ) : (
            <>
              {hasEvid && (
                approved ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onUnapprove(current)}
                    className="gap-1"
                  >
                    <RotateCcw className="w-4 h-4" /> Quitar aprobación
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={handleApprove}
                    className="gap-1 bg-success text-white hover:bg-success/90"
                  >
                    <Check className="w-4 h-4" /> Aprobar
                  </Button>
                )
              )}
              {hasEvid && !approved && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onAskReject(current)}
                  className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" /> Rechazar
                </Button>
              )}
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onEdit(current)}
            className="gap-1"
          >
            <Pencil className="w-4 h-4" /> Editar
          </Button>
        </div>
        {justApprovedLast && (
          <div className="px-3 pb-2 text-center text-[11px] text-muted-foreground">
            ✓ Última evidencia de este sponsor
          </div>
        )}

        {/* Navigation row */}
        <div className="p-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
          {showNav ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!prevId}
              onClick={() => prevId && onNavigate(prevId)}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
          ) : <span />}

          <div className="flex flex-wrap items-center gap-2 order-last sm:order-none w-full sm:w-auto justify-center">
            {showNav && (
              <span className="text-xs text-muted-foreground font-medium">
                {currentIndex !== -1
                  ? `Evidencia ${currentIndex + 1} de ${items.length}`
                  : `— de ${items.length} activas`}
              </span>
            )}
            <Button asChild variant="ghost" size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" /> Abrir en nueva pestaña
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={url} download>
                <Download className="w-4 h-4" /> Descargar
              </a>
            </Button>
          </div>

          {showNav ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!nextId}
              onClick={() => nextId && onNavigate(nextId)}
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </Button>
          ) : <span />}
        </div>
      </DialogContent>
    </Dialog>
  );
};
