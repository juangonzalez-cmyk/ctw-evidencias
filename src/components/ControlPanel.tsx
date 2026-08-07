import { useMemo, useState } from "react";
import { useAllTasks, STATUS, type Task } from "@/hooks/useTasks";
import { useEvent } from "@/context/EventContext";
import { CheckCircle2, Clock, AlertCircle, CircleDashed, ChevronDown, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadAllEvidencias, type DownloadProgress } from "@/lib/downloadEvidencias";
import { Button } from "@/components/ui/button";
import { unifyBrand } from "@/lib/brands";

const statusIcon = (s: string) => {
  if (s === STATUS.APPROVED) return <CheckCircle2 className="w-4 h-4 text-success shrink-0" />;
  if (s === STATUS.REVIEW) return <Clock className="w-4 h-4 text-amber-600 shrink-0" />;
  if (s === STATUS.REJECTED) return <AlertCircle className="w-4 h-4 text-destructive shrink-0" />;
  return <CircleDashed className="w-4 h-4 text-muted-foreground shrink-0" />;
};

const isDone = (s: string) => s === STATUS.APPROVED || s === STATUS.REVIEW;

function formatDayLabel(isoDate: string) {
  try {
    return new Date(isoDate + "T12:00:00").toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return isoDate;
  }
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Extrae YYYY-MM-DD si dia es ISO o texto con fecha. */
function taskDayKey(t: Task): string | null {
  if (!t.dia) return null;
  const iso = t.dia.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  return t.dia; // texto libre (ej. "13 de agosto")
}

type DayFilter = "all" | "dated" | "undated" | string;

export const ControlPanel = () => {
  const { tasks, loading } = useAllTasks();
  const { event } = useEvent();
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const eventDays = useMemo(() => {
    if (event?.starts_on && event?.ends_on) {
      return daysBetween(event.starts_on, event.ends_on);
    }
    return [];
  }, [event]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.deleted_at),
    [tasks]
  );

  const filtered = useMemo(() => {
    if (dayFilter === "all") return activeTasks;
    if (dayFilter === "undated") return activeTasks.filter((t) => !t.dia && !t.hora);
    if (dayFilter === "dated") return activeTasks.filter((t) => !!(t.dia || t.hora));
    // match specific event day
    return activeTasks.filter((t) => {
      const key = taskDayKey(t);
      if (!key) return false;
      if (key === dayFilter) return true;
      // texto contiene día del mes
      const dayNum = dayFilter.slice(8, 10).replace(/^0/, "");
      return (t.dia || "").includes(dayNum);
    });
  }, [activeTasks, dayFilter]);

  const bySponsor = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of filtered) {
      const s = unifyBrand(t.marca);
      (map[s] ||= []).push(t);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => {
        const da = a.dia || "zzz";
        const db = b.dia || "zzz";
        if (da !== db) return da.localeCompare(db, "es");
        return (a.hora || "99:99").localeCompare(b.hora || "99:99");
      });
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [filtered]);

  const doneCount = filtered.filter((t) => isDone(t.status)).length;
  const total = filtered.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const undatedCount = activeTasks.filter((t) => !t.dia && !t.hora).length;
  const datedCount = activeTasks.filter((t) => !!(t.dia || t.hora)).length;
  const sponsorCount = new Set(activeTasks.map((t) => unifyBrand(t.marca))).size;

  const handleDownloadZip = async () => {
    setDownloading(true);
    setDlProgress(null);
    try {
      await downloadAllEvidencias((p) => setDlProgress(p), { eventId: event?.id });
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error descargando evidencias");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Cargando control…</div>;
  }

  return (
    <div className="pb-24 space-y-4">
      <div className="card-task !p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Vista coordinadora
            </div>
            <div className="text-lg font-bold mt-0.5">
              {sponsorCount} sponsors · {activeTasks.length} beneficios
            </div>
          </div>
          <div className="text-right text-sm font-bold">
            {doneCount}/{total}
            <div className="text-xs font-normal text-muted-foreground">{pct}%</div>
          </div>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full gradient-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Cada beneficio es una tarea de captura. Filtra por fecha o sin fecha.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", `Todos (${activeTasks.length})`],
            ["dated", `Con fecha (${datedCount})`],
            ["undated", `Sin fecha (${undatedCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setDayFilter(key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              dayFilter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
        {eventDays.map((d) => (
          <button
            key={d}
            onClick={() => setDayFilter(d)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              dayFilter === d
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground"
            )}
          >
            {formatDayLabel(d)}
          </button>
        ))}
      </div>

      <Button
        onClick={handleDownloadZip}
        disabled={downloading}
        className="w-full gap-2"
        variant="outline"
      >
        <Download className="w-4 h-4" />
        {downloading
          ? dlProgress?.message || "Preparando…"
          : "Descargar evidencias (ZIP)"}
      </Button>

      {bySponsor.length === 0 ? (
        <div className="card-task text-center text-sm text-muted-foreground py-8">
          No hay beneficios con este filtro.
        </div>
      ) : (
        <div className="space-y-2">
          {bySponsor.map(([sponsor, items]) => {
            const open = !!expanded[sponsor];
            const done = items.filter((t) => isDone(t.status)).length;
            return (
              <div key={sponsor} className="card-task !p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [sponsor]: !open }))}
                  className="w-full flex items-center gap-2 px-3 py-3 text-left"
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{sponsor}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {done}/{items.length} con evidencia ·{" "}
                      {items.filter((t) => t.dia || t.hora).length} con fecha
                    </div>
                  </div>
                </button>
                {open && (
                  <ul className="border-t border-border divide-y divide-border">
                    {items.map((t) => (
                      <li key={t.id} className="px-3 py-2.5 flex items-start gap-2 text-xs">
                        {statusIcon(t.status)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium leading-snug">{t.tipo_beneficio}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {t.responsable}
                            {t.dia || t.hora
                              ? ` · ${t.dia || "—"}${t.hora ? ` ${t.hora}` : ""}`
                              : " · Sin fecha"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
