import { useEffect, useMemo, useState } from "react";
import { useAllTasks, STATUS, type Task } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { unifyBrand } from "@/lib/brands";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  LayoutGrid,
  LayoutList,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displayBeneficioLabel } from "@/lib/beneficioLabel";
import { useEvent } from "@/context/EventContext";
import { toast } from "sonner";
import {
  downloadSponsorPdfBlob,
  ensureSponsorReportTokens,
  publicInformeUrl,
  staffInformePath,
} from "@/lib/sponsorReports";
import { hasRequiredEvidence } from "@/lib/standRecepcion";

interface Props {
  responsable: string;
  uploaderName: string;
  relevoOf?: string;
  kamView?: boolean;
}

type ViewMode = "lista" | "tarjetas";

const VIEW_KEY = "ctw-field-sponsors-view";

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "lista" || v === "tarjetas") return v;
  } catch {
    /* ignore */
  }
  return "lista";
}

function statusPriority(t: Task): number {
  if (t.status === STATUS.REJECTED) return 0;
  if (t.status === STATUS.PENDING) return 1;
  if (t.status === STATUS.REVIEW) return 2;
  return 3;
}

function statusChip(t: Task) {
  if (t.status === STATUS.APPROVED)
    return { label: "OK", cls: "bg-success/15 text-success" };
  if (t.status === STATUS.REVIEW)
    return { label: "Subido", cls: "bg-primary/15 text-primary" };
  if (t.status === STATUS.REJECTED)
    return { label: "Rechazo", cls: "bg-destructive/15 text-destructive" };
  return { label: "Pendiente", cls: "bg-muted text-muted-foreground" };
}

export const TaskList = ({ responsable, uploaderName, relevoOf, kamView = false }: Props) => {
  const { event } = useEvent();
  const { tasks: allTasks, loading } = useAllTasks();
  const [search, setSearch] = useState("");
  const [openSponsors, setOpenSponsors] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [reportTokens, setReportTokens] = useState<Record<string, string>>({});
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const active = useMemo(() => allTasks.filter((t) => !t.deleted_at), [allTasks]);

  const portfolioBrands = useMemo(() => {
    const set = new Set<string>();
    for (const t of active) {
      if (t.responsable === responsable) set.add(unifyBrand(t.marca));
    }
    return set;
  }, [active, responsable]);

  const tasks = useMemo(() => {
    if (!kamView) return active.filter((t) => t.responsable === responsable);
    return active.filter((t) => portfolioBrands.has(unifyBrand(t.marca)));
  }, [active, kamView, responsable, portfolioBrands]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const completed = useMemo(
    () => tasks.filter((t) => hasRequiredEvidence({ ...t, rejected_at: null })).length,
    [tasks]
  );

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? tasks.filter((t) => {
          const sponsor = unifyBrand(t.marca).toLowerCase();
          return (
            sponsor.includes(q) ||
            t.marca.toLowerCase().includes(q) ||
            t.tipo_beneficio.toLowerCase().includes(q)
          );
        })
      : tasks;

    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const key = unifyBrand(t.marca);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const p = statusPriority(a) - statusPriority(b);
        if (p !== 0) return p;
        return (a.tipo_beneficio || "").localeCompare(b.tipo_beneficio || "", "es");
      });
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [tasks, search]);

  const isOpen = (sponsor: string) => {
    if (openSponsors[sponsor] !== undefined) return !!openSponsors[sponsor];
    return search.trim().length > 0;
  };

  const toggle = (sponsor: string) =>
    setOpenSponsors((s) => ({ ...s, [sponsor]: !isOpen(sponsor) }));

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const [s] of grouped) next[s] = true;
    setOpenSponsors(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const [s] of grouped) next[s] = false;
    setOpenSponsors(next);
    setExpandedId(null);
  };

  const kamSponsorNames = useMemo(
    () => Array.from(portfolioBrands).sort((a, b) => a.localeCompare(b, "es")),
    [portfolioBrands]
  );

  useEffect(() => {
    if (!kamView || !event || kamSponsorNames.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await ensureSponsorReportTokens(event.id, kamSponsorNames);
        if (!cancelled) setReportTokens(map);
      } catch (e) {
        console.error("ensure_sponsor_reports failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kamView, event, kamSponsorNames]);

  const copyReportLink = async (sponsor: string) => {
    const token = reportTokens[sponsor];
    if (!token) {
      toast.error("Aún no hay link — recarga en unos segundos");
      return;
    }
    const url = publicInformeUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link del informe (para el sponsor) copiado");
    } catch {
      window.prompt("Copia este link del informe:", url);
    }
  };

  const openReport = (sponsor: string) => {
    const token = reportTokens[sponsor];
    if (!token) {
      toast.error("Aún no hay link — recarga en unos segundos");
      return;
    }
    window.location.assign(staffInformePath(token));
  };

  const downloadReport = async (sponsor: string, items: Task[]) => {
    setPdfBusy(sponsor);
    try {
      await downloadSponsorPdfBlob({
        sponsorName: sponsor,
        eventName: event?.short_name || event?.name || "CTW",
        tasks: items,
      });
      toast.success("Informe generado");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Cargando sponsors…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        No hay tareas asignadas todavía.
      </div>
    );
  }

  const renderBenefitRow = (t: Task) => {
    const rowOpen = expandedId === t.id;
    const chip = statusChip(t);
    const mine = t.responsable === responsable;
    return (
      <li key={t.id} className="border-t border-border/70">
        <button
          type="button"
          className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
          onClick={() => setExpandedId(rowOpen ? null : t.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold leading-snug line-clamp-2">
              {displayBeneficioLabel(t.tipo_beneficio)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {t.is_timed && t.hora ? `${t.dia} · ${t.hora}` : null}
              {kamView && t.responsable ? `${t.is_timed && t.hora ? " · " : ""}Captura: ${t.responsable}` : null}
              {kamView && !mine ? " · solo lectura" : null}
            </div>
          </div>
          <span
            className={cn(
              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0",
              chip.cls
            )}
          >
            {chip.label}
          </span>
          {rowOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </button>
        {rowOpen && (
          <div className="px-3 pb-3">
            <TaskCard
              task={t}
              uploaderName={uploaderName}
              relevoOf={relevoOf}
              readOnly={kamView && !mine}
            />
          </div>
        )}
      </li>
    );
  };

  const renderSponsorGroup = (sponsor: string, items: Task[], asCard: boolean) => {
    const open = isOpen(sponsor);
    const done = items.filter((t) => hasRequiredEvidence({ ...t, rejected_at: null })).length;
    const pending = items.length - done;

    return (
      <section
        key={sponsor}
        className={cn(
          "overflow-hidden bg-card border border-border h-full",
          asCard ? "rounded-2xl shadow-sm" : "border-x-0 border-t-0 last:border-b-0"
        )}
      >
        <button
          type="button"
          onClick={() => toggle(sponsor)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-muted/40 hover:bg-muted/60 transition-colors"
        >
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{sponsor}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {done}/{items.length} listos
              {pending > 0 ? ` · ${pending} pendientes` : ""}
            </div>
          </div>
          <span
            className={cn(
              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0",
              pending === 0
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            {pending === 0 ? "OK" : `${pending}`}
          </span>
        </button>
        {kamView && (
          <div className="flex items-center gap-1 px-3 pb-2 bg-muted/40">
            <button
              type="button"
              onClick={() => void copyReportLink(sponsor)}
              className="p-1.5 rounded-lg hover:bg-background text-muted-foreground"
              title="Copiar link para el sponsor"
              aria-label={`Copiar link informe ${sponsor}`}
            >
              <Link2 className="w-4 h-4" />
            </button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px] px-2"
              onClick={() => openReport(sponsor)}
            >
              Ver informe
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[10px] px-2"
              disabled={pdfBusy === sponsor || done === 0}
              onClick={() => void downloadReport(sponsor, items)}
            >
              {pdfBusy === sponsor ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5 mr-1" />
              )}
              Generar PDF
            </Button>
          </div>
        )}

        {open && (
          <ul className="divide-y-0">{items.map((t) => renderBenefitRow(t))}</ul>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="card-task !p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              {kamView ? "Portafolio KAM" : "Mis sponsors"}
            </div>
            <div className="text-lg font-bold mt-0.5">
              {grouped.length} sponsor{grouped.length === 1 ? "" : "s"} · {tasks.length}{" "}
              beneficios
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {completed}/{tasks.length} con soporte cargado
              {kamView ? " · incluye beneficios de otros roles" : ""}
            </div>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("lista")}
              className={cn(
                "px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1",
                viewMode === "lista"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
              aria-label="Vista lista"
            >
              <LayoutList className="w-3.5 h-3.5" /> Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("tarjetas")}
              className={cn(
                "px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1 border-l border-border",
                viewMode === "tarjetas"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
              aria-label="Vista tarjetas"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Tarjetas
            </button>
          </div>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full gradient-primary transition-all"
            style={{
              width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar sponsor o beneficio…"
            className="pl-9 h-10"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 flex-1 sm:flex-none min-w-[6.5rem]"
            onClick={expandAll}
          >
            Expandir
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 flex-1 sm:flex-none min-w-[6.5rem]"
            onClick={collapseAll}
          >
            Colapsar
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card">
          Ningún sponsor coincide con “{search.trim()}”.
        </div>
      ) : viewMode === "lista" ? (
        <>
          <div className="rounded-2xl border border-border overflow-hidden bg-card md:hidden">
            {grouped.map(([sponsor, items]) => renderSponsorGroup(sponsor, items, false))}
          </div>
          <div className="hidden md:grid md:grid-cols-2 gap-3">
            {grouped.map(([sponsor, items]) => renderSponsorGroup(sponsor, items, true))}
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grouped.map(([sponsor, items]) => renderSponsorGroup(sponsor, items, true))}
        </div>
      )}
    </div>
  );
};
