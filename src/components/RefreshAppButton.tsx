import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshAppHard } from "@/lib/appRefresh";
import { toast } from "sonner";

interface Props {
  className?: string;
}

/** Recarga datos y fuerza bundle nuevo (útil tras deploys / PWA cacheada). */
export function RefreshAppButton({ className }: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    toast.message("Actualizando app…", {
      description: "Datos frescos y última versión desplegada",
    });
    try {
      await refreshAppHard();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar", {
        description: (e as Error).message,
      });
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center rounded-xl p-2 border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-60",
        className
      )}
      aria-label="Actualizar app"
      title="Actualizar datos y versión"
    >
      <RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} />
    </button>
  );
}
