import { Download, Share, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { cn } from "@/lib/utils";

type Variant = "banner" | "icon" | "full";

interface Props {
  variant?: Variant;
  className?: string;
}

export function InstallAppButton({ variant = "full", className }: Props) {
  const {
    canInstall,
    install,
    iosHint,
    dismissIosHint,
    manualHint,
    dismissManualHint,
    isIos,
  } = usePwaInstall();

  if (!canInstall) return null;

  const hints = (
    <>
      {iosHint && <IosHint onClose={dismissIosHint} />}
      {manualHint && <ManualHint onClose={dismissManualHint} />}
    </>
  );

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={() => void install()}
          className={cn(
            "p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors",
            className
          )}
          aria-label="Descargar app"
          title="Descargar app"
        >
          <Download className="w-4 h-4" />
        </button>
        {hints}
      </>
    );
  }

  if (variant === "banner") {
    return (
      <>
        <button
          type="button"
          onClick={() => void install()}
          className={cn(
            "w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left",
            "bg-primary text-primary-foreground shadow-md active:scale-[0.98] transition-all",
            className
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/10 shrink-0">
            <Download className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm">Descargar app</span>
            <span className="block text-xs opacity-80 mt-0.5">
              {isIos
                ? "Instálala en tu iPhone para usarla sin el navegador"
                : "Instálala en tu celular para acceso rápido"}
            </span>
          </span>
        </button>
        {hints}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
          "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all",
          className
        )}
      >
        <Download className="w-4 h-4" />
        Descargar app
      </button>
      {hints}
    </>
  );
}

function IosHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby="ios-install-title"
        className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 id="ios-install-title" className="font-bold text-base">
            Instalar en iPhone
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="font-bold text-foreground">1.</span>
            <span>
              Toca{" "}
              <Share className="inline w-4 h-4 text-foreground align-text-bottom" />{" "}
              <strong className="text-foreground">Compartir</strong> en Safari.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-foreground">2.</span>
            <span>
              Elige{" "}
              <strong className="text-foreground">“Añadir a pantalla de inicio”</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-foreground">3.</span>
            <span>
              Confirma con <strong className="text-foreground">Añadir</strong>.
            </span>
          </li>
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 text-sm"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

function ManualHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby="manual-install-title"
        className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 id="manual-install-title" className="font-bold text-base">
            Instalar la app
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="font-bold text-foreground">1.</span>
            <span>Abre esta página en <strong className="text-foreground">Chrome</strong> en tu celular.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-foreground">2.</span>
            <span>
              Toca el menú <strong className="text-foreground">⋮</strong> y elige{" "}
              <strong className="text-foreground">“Instalar app”</strong> o{" "}
              <strong className="text-foreground">“Añadir a la pantalla de inicio”</strong>.
            </span>
          </li>
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 text-sm"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
