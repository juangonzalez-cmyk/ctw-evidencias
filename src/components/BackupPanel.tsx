import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Package, RotateCcw, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface BackupRow {
  table_name: string;
  row_count: number;
}

const BOGOTA_FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Parse "tasks_backup_YYYY_MM_DD_HH_mm[_pre_restore]" → ISO UTC date
function parseBackupTimestamp(name: string): Date | null {
  const m = name.match(/^tasks_backup_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00Z`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

function nowBackupName(suffix: ""): string;
function nowBackupName(suffix: "_pre_restore"): string;
function nowBackupName(suffix: "" | "_pre_restore"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}` +
    `_${pad(d.getUTCHours())}_${pad(d.getUTCMinutes())}`;
  return `tasks_backup_${stamp}${suffix}`;
}

export const BackupPanel = () => {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackupRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_task_backups");
    if (error) {
      console.error(error);
      toast.error("Error al cargar backups");
      setBackups([]);
    } else {
      setBackups((data as BackupRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    const name = nowBackupName("");
    toast.loading("Creando backup…", { id: "create-bk" });
    const { data, error } = await supabase.rpc("create_task_backup", { p_name: name });
    setCreating(false);
    if (error) {
      console.error(error);
      toast.error(error.message || "Error al crear backup", { id: "create-bk" });
      return;
    }
    const result = (data as BackupRow[])?.[0];
    toast.success(`✓ Backup creado: ${result?.table_name || name} (${result?.row_count ?? "?"} filas)`, { id: "create-bk" });
    refresh();
  };

  const handleConfirmRestore = async () => {
    const target = restoreTarget;
    if (!target) return;
    setRestoring(true);
    const preName = nowBackupName("_pre_restore");
    toast.loading("Restaurando backup…", { id: "restore-bk" });
    const { data, error } = await supabase.rpc("restore_task_backup", {
      p_name: target.table_name,
      p_pre_restore_name: preName,
    });
    setRestoring(false);
    if (error) {
      console.error(error);
      toast.error(error.message || "Error al restaurar backup", { id: "restore-bk" });
      return;
    }
    const result = (data as any[])?.[0];
    setRestoreTarget(null);
    setRestoreConfirmText("");
    toast.success(
      `✓ Backup restaurado (${result?.row_count ?? "?"} filas). Se creó respaldo de seguridad: ${result?.pre_restore || preName}`,
      { id: "restore-bk", duration: 8000 },
    );
    refresh();
    // Reload to refresh all dashboard data
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleConfirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_task_backup", { p_name: target.table_name });
    setDeleting(false);
    if (error) {
      console.error(error);
      toast.error(error.message || "Error al eliminar backup");
      return;
    }
    setDeleteTarget(null);
    toast.success("🗑️ Backup eliminado");
    refresh();
  };

  const formatBackupDate = (name: string): string => {
    const d = parseBackupTimestamp(name);
    return d ? BOGOTA_FMT.format(d) : "—";
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="card-task !p-4">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base">Backups de la base de datos</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Crea instantáneas manuales de la tabla de beneficios. Los archivos del storage no se
              respaldan (siguen guardados en el bucket).
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={handleCreate} disabled={creating} className="gap-2">
            <Package className="w-4 h-4" />
            {creating ? "Creando…" : "📦 Crear backup ahora"}
          </Button>
          <Button onClick={refresh} variant="outline" disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} /> Actualizar
          </Button>
        </div>
      </div>

      {backups.length > 10 && (
        <div className="card-task !p-3 border-amber-300 bg-amber-50 text-amber-800 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Tienes <strong>{backups.length}</strong> backups guardados. Considera eliminar los más
            antiguos para mantener la base de datos limpia.
          </span>
        </div>
      )}

      <div className="card-task !p-0 overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Backups existentes ({backups.length})
        </div>
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Cargando…</div>
        ) : backups.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Sin backups. Crea el primero con el botón de arriba.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {backups.map((b) => {
              const isPre = b.table_name.endsWith("_pre_restore");
              return (
                <li key={b.table_name} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-mono text-xs font-semibold flex items-center gap-2 flex-wrap">
                      {b.table_name}
                      {isPre && (
                        <span className="text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                          Pre-restore
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      📅 {formatBackupDate(b.table_name)} · {b.row_count} filas
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setRestoreTarget(b); setRestoreConfirmText(""); }}
                      className="h-8 text-[11px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <RotateCcw className="w-3 h-3" /> Restaurar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteTarget(b)}
                      className="h-8 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" /> Eliminar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Restore confirmation */}
      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setRestoreConfirmText(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ ¿Restaurar el backup {restoreTarget?.table_name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta acción <strong>VA A REEMPLAZAR</strong> todos los datos actuales de la tabla
                  de beneficios con los del backup. Los cambios hechos después de{" "}
                  <strong>{restoreTarget ? formatBackupDate(restoreTarget.table_name) : ""}</strong>{" "}
                  <strong>SE PERDERÁN</strong>.
                </p>
                <p>
                  Como medida de seguridad, antes de restaurar se creará automáticamente un backup
                  del estado actual con sufijo <code>_pre_restore</code>.
                </p>
                <p className="font-semibold text-destructive">Esta acción NO se puede deshacer.</p>
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    Escribe <code className="bg-muted px-1 rounded">RESTAURAR</code> en el campo de
                    abajo para confirmar:
                  </label>
                  <Input
                    value={restoreConfirmText}
                    onChange={(e) => setRestoreConfirmText(e.target.value)}
                    placeholder="RESTAURAR"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreConfirmText !== "RESTAURAR" || restoring}
              onClick={handleConfirmRestore}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoring ? "Restaurando…" : "Sí, restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el backup {deleteTarget?.table_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Creado el{" "}
              <strong>{deleteTarget ? formatBackupDate(deleteTarget.table_name) : ""}</strong>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
