import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/hooks/useTasks";
import { uploadActaRecepcion } from "@/lib/upload";
import { useEvent } from "@/context/EventContext";
import { cn } from "@/lib/utils";
import { STAND_ACEPTACION_TEXT } from "@/lib/standRecepcion";
import { displayBeneficioLabel } from "@/lib/beneficioLabel";

interface Props {
  open: boolean;
  task: Task;
  uploaderName: string;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Popup a pantalla completa en portal (fuera del TaskCard) para que la firma
 * táctil no choque con scroll ni botones de la app.
 */
export function StandRecepcionModal({
  open,
  task,
  uploaderName,
  onClose,
  onSaved,
}: Props) {
  const { event } = useEvent();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const hasStrokeRef = useRef(false);
  const [firmaNombre, setFirmaNombre] = useState(task.firma_nombre || "");
  const [hasStroke, setHasStroke] = useState(false);
  const [saving, setSaving] = useState(false);

  const paintBlank = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(200, Math.min(320, Math.round(w * 0.5)));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const clearPad = useCallback(() => {
    hasStrokeRef.current = false;
    setHasStroke(false);
    paintBlank();
  }, [paintBlank]);

  useEffect(() => {
    if (!open) return;
    setFirmaNombre(task.firma_nombre || "");
    hasStrokeRef.current = false;
    setHasStroke(false);
    setSaving(false);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => paintBlank(), 30);
    const onOrient = () => {
      if (!hasStrokeRef.current) paintBlank();
    };
    window.addEventListener("orientationchange", onOrient);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [open, task.id, task.firma_nombre, paintBlank]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * (canvas.clientWidth || rect.width),
      y: ((e.clientY - rect.top) / rect.height) * (canvas.clientHeight || rect.height),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drawing.current = true;
    last.current = pointerPos(e);
    // punto inicial
    const ctx = canvas.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.fillStyle = "#111111";
      ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      hasStrokeRef.current = true;
      setHasStroke(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !last.current) return;
    const pos = pointerPos(e);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true;
      setHasStroke(true);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drawing.current = false;
    last.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const composeActaBlob = async (): Promise<Blob> => {
    const sig = canvasRef.current;
    if (!sig) throw new Error("Canvas no disponible");

    const W = 1080;
    const H = 1520;
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el acta");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, 16);
    ctx.fillStyle = "#96e631";
    ctx.fillRect(0, 16, W, 8);

    ctx.fillStyle = "#111111";
    ctx.font = "bold 36px Helvetica, Arial, sans-serif";
    ctx.fillText("ACTA DE RECEPCIÓN DE STAND", 64, 90);

    ctx.font = "22px Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#444444";
    const eventName = event?.name || event?.short_name || "Colombia Tech Week";
    ctx.fillText(eventName, 64, 130);

    const fecha = new Date().toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "long",
      timeStyle: "short",
    });

    const lines: Array<[string, string]> = [
      ["Sponsor", task.marca],
      ["Beneficio", displayBeneficioLabel(task.tipo_beneficio)],
      ["Firmante", firmaNombre.trim()],
      ["Fecha de firma", fecha],
      ["Responsable CTW", uploaderName],
    ];

    let y = 200;
    ctx.font = "20px Helvetica, Arial, sans-serif";
    for (const [label, value] of lines) {
      ctx.fillStyle = "#888888";
      ctx.fillText(label.toUpperCase(), 64, y);
      ctx.fillStyle = "#111111";
      ctx.font = "bold 28px Helvetica, Arial, sans-serif";
      const wrapped = wrapText(ctx, value || "—", W - 128);
      for (const line of wrapped) {
        y += 36;
        ctx.fillText(line, 64, y);
      }
      y += 28;
      ctx.font = "20px Helvetica, Arial, sans-serif";
    }

    y += 20;
    ctx.fillStyle = "#111111";
    ctx.font = "bold 22px Helvetica, Arial, sans-serif";
    ctx.fillText("Declaración", 64, y);
    y += 36;
    ctx.font = "bold 24px Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#111111";
    for (const line of wrapText(ctx, STAND_ACEPTACION_TEXT, W - 128)) {
      ctx.fillText(line, 64, y);
      y += 32;
    }

    y += 40;
    ctx.fillStyle = "#888888";
    ctx.font = "18px Helvetica, Arial, sans-serif";
    ctx.fillText("FIRMA DEL SPONSOR", 64, y);
    y += 16;

    const padW = W - 128;
    const padH = 280;
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 2;
    ctx.strokeRect(64, y, padW, padH);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(64, y, padW, padH);

    const scale = Math.min(padW / sig.clientWidth, padH / sig.clientHeight) * 0.92;
    const dw = sig.clientWidth * scale;
    const dh = sig.clientHeight * scale;
    const dx = 64 + (padW - dw) / 2;
    const dy = y + (padH - dh) / 2;
    ctx.drawImage(sig, dx, dy, dw, dh);

    y += padH + 48;
    ctx.strokeStyle = "#cccccc";
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(64 + 360, y);
    ctx.stroke();
    ctx.fillStyle = "#666666";
    ctx.font = "18px Helvetica, Arial, sans-serif";
    ctx.fillText(firmaNombre.trim() || "Firmante", 64, y + 28);

    ctx.fillStyle = "#aaaaaa";
    ctx.font = "16px Helvetica, Arial, sans-serif";
    ctx.fillText("Colombia Tech Week · Evidencias", 64, H - 40);

    return new Promise((resolve, reject) => {
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo generar el PNG del acta"))),
        "image/png",
        0.95
      );
    });
  };

  const handleConfirm = async () => {
    if (!firmaNombre.trim()) {
      toast.warning("Escribe el nombre de quien firma");
      return;
    }
    if (!hasStrokeRef.current && !hasStroke) {
      toast.warning("Pide al sponsor que firme en el recuadro");
      return;
    }
    setSaving(true);
    try {
      const blob = await composeActaBlob();
      await uploadActaRecepcion(
        task.id,
        blob,
        firmaNombre.trim(),
        uploaderName,
        event?.id,
        task.acta_recepcion_url
      );
      toast.success("Acta firmada guardada");
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar el acta", {
        description: (err as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Acta de recepción de stand"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: "none" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border safe-top shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Acta de recepción
          </p>
          <h2 className="font-bold text-base truncate">{task.marca}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {displayBeneficioLabel(task.tipo_beneficio)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="p-2 rounded-xl bg-secondary"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      >
        <p className="text-sm text-muted-foreground">
          Pasa el teléfono al sponsor para que escriba su nombre y firme con el dedo.
        </p>

        <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Texto de aceptación
          </p>
          <p className="text-sm font-semibold leading-snug">{STAND_ACEPTACION_TEXT}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Nombre del firmante
          </span>
          <input
            value={firmaNombre}
            onChange={(e) => setFirmaNombre(e.target.value)}
            placeholder="Nombre completo"
            className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base"
            autoComplete="name"
            style={{ touchAction: "manipulation" }}
          />
        </label>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">
              Firma con el dedo
            </span>
            <button
              type="button"
              onClick={clearPad}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground px-2 py-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Limpiar
            </button>
          </div>
          <div
            className={cn(
              "rounded-xl border-2 border-dashed border-border bg-white overflow-hidden select-none",
              hasStroke && "border-solid border-primary/40"
            )}
            style={{ touchAction: "none" }}
          >
            <canvas
              ref={canvasRef}
              className="w-full block cursor-crosshair"
              style={{ touchAction: "none", display: "block" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Dibuja la firma dentro del recuadro blanco.
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-border flex gap-2 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          disabled={saving}
          className="flex-1 py-3 rounded-xl font-semibold bg-secondary text-muted-foreground"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={saving}
          className="flex-1 py-3 rounded-xl font-semibold gradient-primary text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? "Guardando…" : "Confirmar firma"}
        </button>
      </div>
    </div>,
    document.body
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
}
