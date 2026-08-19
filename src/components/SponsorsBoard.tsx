import { useEffect, useMemo, useState } from "react";
import { useAllTasks, STATUS, type Task } from "@/hooks/useTasks";
import { useEvent } from "@/context/EventContext";
import { supabase } from "@/integrations/supabase/client";
import { unifyBrand } from "@/lib/brands";
import { FASES, FASE_LABEL, getFase, type FaseFiltro } from "@/lib/fases";
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
import { AddBenefitModal } from "@/components/AddBenefitModal";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  LayoutGrid,
  LayoutList,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FLUJO_SIMPLE,
  FLUJO_STAND_RECEPCION,
  hasRequiredEvidence,
  isStandRecepcion,
  isStandRecepcionComplete,
  resolveStandStatusAfterEdit,
} from "@/lib/standRecepcion";
import { displayBeneficioLabel } from "@/lib/beneficioLabel";
import { downloadAllEvidencias, type DownloadProgress } from "@/lib/downloadEvidencias";
import { safeHttpUrl } from "@/lib/upload";
import { staffInformePath } from "@/lib/sponsorReports";

const VIEW_KEY = "ctw-coord-sponsors-view";
type ViewMode = "lista" | "tarjetas";

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "tarjetas" || v === "lista") return v;
  } catch {
    /* ignore */
  }
  return "lista";
}

/**
 * Hub coordinador: sponsors en acordeón + filtros simples + ZIP + editar beneficios.
 */
export function SponsorsBoard() {
  const { tasks, loading, refetch } = useAllTasks();
  const { event, profiles } = useEvent();

  const [search, setSearch] = useState("");
  const [fase, setFase] = useState<FaseFiltro>("all");
  const [owner, setOwner] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [estado, setEstado] = useState<"all" | "pendiente" | "con_evidencia" | "aprobada">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState("");
  /** null = idle; "*" = bulk; id = esa fila */
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = busyId !== null;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sponsorOpen, setSponsorOpen] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [reportTokens, setReportTokens] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Task | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);

  const active = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks]);

  const sponsorNames = useMemo(
    () => Array.from(new Set(active.map((t) => unifyBrand(t.marca)))).sort((a, b) => a.localeCompare(b, "es")),
    [active]
  );

  const tipoOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of active) {
      if (!t.tipo_beneficio) continue;
      const label = displayBeneficioLabel(t.tipo_beneficio);
      if (!map.has(t.tipo_beneficio)) map.set(t.tipo_beneficio, label);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [active]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    if (!event || sponsorNames.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: existing } = await supabase
          .from("sponsor_reports")
          .select("sponsor_unified_name, token")
          .eq("event_id", event.id);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const r of existing ?? []) map[r.sponsor_unified_name] = r.token;
        const missing = sponsorNames.filter((n) => !map[n]);
        if (missing.length) {
          const { data: created } = await supabase
            .from("sponsor_reports")
            .insert(
              missing.map((sponsor_unified_name) => ({
                event_id: event.id,
                sponsor_unified_name,
              }))
            )
            .select("sponsor_unified_name, token");
          for (const r of created ?? []) map[r.sponsor_unified_name] = r.token;
        }
        setReportTokens(map);
      } catch (e) {
        console.error("ensure_sponsor_reports failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event, sponsorNames]);

  const copyReportLink = async (sponsor: string) => {
    const token = reportTokens[sponsor];
    if (!token) {
      toast.error("Aún no hay link — recarga en unos segundos");
      return;
    }
    const url = `${window.location.origin}/informe/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link del informe copiado");
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
    // Misma ventana/PWA: evita perder el contexto de la app (sin barra del navegador).
    window.location.assign(staffInformePath(token));
  };

  const approveTask = async (task: Task) => {
    if (isStandRecepcion(task) && !isStandRecepcionComplete(task)) {
      toast.error("El stand aún no está completo", {
        description: "Falta foto, acta firmada o horarios de entrega.",
      });
      return;
    }
    if (!isStandRecepcion(task) && !hasRequiredEvidence({ ...task, rejected_at: null })) {
      toast.error("No hay evidencia para aprobar");
      return;
    }
    setBusyId(task.id);
    const { error } = await supabase
      .from("tasks")
      .update({
        status: STATUS.APPROVED,
        approved_at: new Date().toISOString(),
        rejected_at: null,
        edited_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    setBusyId(null);
    if (error) {
      toast.error("No se pudo aprobar", { description: error.message });
      return;
    }
    toast.success("Evidencia aprobada");
    refetch();
  };

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const t of active) if (t.responsable) set.add(t.responsable);
    for (const p of profiles) if (!p.is_coordinator) set.add(p.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [active, profiles]);

  const filtered = useMemo(() => {
    return active.filter((t) => {
      if (fase !== "all" && getFase(t) !== fase) return false;
      if (owner !== "all" && t.responsable !== owner) return false;
      if (tipo !== "all" && t.tipo_beneficio !== tipo) return false;
      if (estado === "pendiente" && hasRequiredEvidence({ ...t, rejected_at: null })) return false;
      if (estado === "con_evidencia" && !hasRequiredEvidence({ ...t, rejected_at: null })) return false;
      if (estado === "aprobada" && t.status !== STATUS.APPROVED) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay =
          t.marca.toLowerCase().includes(q) ||
          t.tipo_beneficio.toLowerCase().includes(q) ||
          displayBeneficioLabel(t.tipo_beneficio).toLowerCase().includes(q) ||
          (t.responsable || "").toLowerCase().includes(q) ||
          unifyBrand(t.marca).toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [active, fase, owner, tipo, estado, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const s = unifyBrand(t.marca);
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        displayBeneficioLabel(a.tipo_beneficio).localeCompare(
          displayBeneficioLabel(b.tipo_beneficio),
          "es"
        )
      );
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = active.length;
    const withEv = active.filter((t) => hasRequiredEvidence({ ...t, rejected_at: null })).length;
    const sponsors = new Set(active.map((t) => unifyBrand(t.marca))).size;
    const pct = total ? Math.round((withEv / total) * 100) : 0;
    return { total, withEv, sponsors, pending: total - withEv, pct };
  }, [active]);

  const filteredStats = useMemo(() => {
    const withEv = filtered.filter((t) => hasRequiredEvidence({ ...t, rejected_at: null })).length;
    return { total: filtered.length, withEv };
  }, [filtered]);

  const isSponsorOpen = (sponsor: string) => !!sponsorOpen[sponsor];

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const [s] of grouped) next[s] = true;
    setSponsorOpen(next);
  };

  const collapseAll = () => {
    setSponsorOpen({});
    setExpandedId(null);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSponsorSelect = (items: Task[]) => {
    const ids = items.map((t) => t.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkAssign = async () => {
    if (!bulkOwner.trim() || selected.size === 0) {
      toast.error("Elige responsable y al menos un beneficio");
      return;
    }
    setBusyId("*");
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("tasks")
      .update({ responsable: bulkOwner.trim(), edited_at: new Date().toISOString() })
      .in("id", ids);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} beneficios → ${bulkOwner}`);
    clearSelection();
    refetch();
  };

  const saveRow = async (task: Task, patch: Partial<Task>) => {
    setBusyId(task.id);
    let finalPatch: Partial<Task> = { ...patch, edited_at: new Date().toISOString() };

    if (patch.flujo !== undefined) {
      const merged = {
        evidencia_url: task.evidencia_url,
        acta_recepcion_url: task.acta_recepcion_url,
        entrega_ctw_at: task.entrega_ctw_at,
        entrega_sponsor_at: task.entrega_sponsor_at,
      };
      if (patch.flujo === FLUJO_STAND_RECEPCION) {
        const resolved = resolveStandStatusAfterEdit(task.status, merged);
        finalPatch = {
          ...finalPatch,
          flujo: FLUJO_STAND_RECEPCION,
          media_type: task.media_type || "photo",
          category: task.category || "Stands",
          status: resolved.status,
          ...(resolved.clearApproved ? { approved_at: null } : {}),
        };
      } else {
        // Al quitar acta: no tocar si ya estaba aprobado con evidencia simple
        const keepApproved = task.status === STATUS.APPROVED && !!task.evidencia_url;
        finalPatch = {
          ...finalPatch,
          flujo: FLUJO_SIMPLE,
          status: keepApproved
            ? STATUS.APPROVED
            : task.evidencia_url
              ? STATUS.REVIEW
              : STATUS.PENDING,
          ...(keepApproved ? {} : { approved_at: null }),
        };
      }
    }

    const { error } = await supabase.from("tasks").update(finalPatch).eq("id", task.id);
    setBusyId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Guardado");
      refetch();
    }
  };

  const softDeleteTasks = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusyId(ids.length === 1 ? ids[0]! : "*");
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    setBusyId(null);
    if (error) {
      toast.error(error.message || "No se pudo eliminar");
      return;
    }
    setDeleteConfirm(null);
    setBulkDeleteConfirm(false);
    setExpandedId((cur) => (cur && ids.includes(cur) ? null : cur));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    toast.success(
      ids.length === 1 ? "Beneficio eliminado" : `${ids.length} beneficios eliminados`
    );
    refetch();
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    setDlProgress(null);
    try {
      await downloadAllEvidencias((p) => setDlProgress(p), { eventId: event?.id });
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error descargando evidencias");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  const renderSponsorGroup = (sponsor: string, items: Task[], asCard: boolean) => {
    const open = isSponsorOpen(sponsor);
    const withEv = items.filter((t) => hasRequiredEvidence({ ...t, rejected_at: null })).length;
    const allOn = items.every((t) => selected.has(t.id));

    return (
      <div
        key={sponsor}
        className={cn(
          "overflow-hidden bg-card border border-border",
          asCard ? "rounded-2xl shadow-sm" : "border-x-0 border-t-0 last:border-b-0",
          !asCard && "first:border-t-0"
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40">
          <button
            type="button"
            onClick={() => toggleSponsorSelect(items)}
            className={cn(
              "w-5 h-5 rounded border flex items-center justify-center shrink-0",
              allOn
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border bg-background"
            )}
            aria-label={`Seleccionar ${sponsor}`}
          >
            {allOn && <Check className="w-3 h-3" />}
          </button>
          <button
            type="button"
            className="flex-1 min-w-0 text-left flex items-center gap-2"
            onClick={() => setSponsorOpen((s) => ({ ...s, [sponsor]: !open }))}
          >
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{sponsor}</div>
              <div className="text-[10px] text-muted-foreground">
                {withEv}/{items.length} evidencias
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void copyReportLink(sponsor)}
            className="p-1.5 rounded-lg hover:bg-background text-muted-foreground"
            title="Copiar link del informe"
            aria-label={`Copiar link informe ${sponsor}`}
          >
            <Link2 className="w-4 h-4" />
          </button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px] px-2 shrink-0"
            onClick={() => openReport(sponsor)}
          >
            Informe
          </Button>
        </div>

        {open && (
          <ul className="border-t border-border divide-y divide-border/70">
            {items.map((t) => {
              const rowOpen = expandedId === t.id;
              const on = selected.has(t.id);
              return (
                <li key={t.id}>
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0",
                        on
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border"
                      )}
                    >
                      {on && <Check className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setExpandedId(rowOpen ? null : t.id)}
                    >
                      <div className="text-sm font-semibold leading-snug line-clamp-3">
                        {displayBeneficioLabel(t.tipo_beneficio)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                        <span>{t.responsable}</span>
                        <span>
                          {t.dia || t.hora
                            ? `${t.dia || ""}${t.hora ? ` ${t.hora}` : ""}`
                            : "Sin fecha"}
                        </span>
                        <span
                          className={cn(
                            "font-semibold uppercase",
                            hasRequiredEvidence({ ...t, rejected_at: null })
                              ? "text-success"
                              : "text-muted-foreground"
                          )}
                        >
                          {hasRequiredEvidence({ ...t, rejected_at: null })
                            ? t.status === STATUS.APPROVED
                              ? "OK"
                              : "Subida"
                            : "Pendiente"}
                        </span>
                        {isStandRecepcion(t) && (
                          <span className="font-semibold text-primary uppercase">Acta</span>
                        )}
                      </div>
                    </button>
                    {rowOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>

                  {rowOpen && (
                    <InlineEditor
                      task={t}
                      owners={owners}
                      busy={busyId === t.id || busyId === "*"}
                      onSave={saveRow}
                      onApprove={approveTask}
                      onDelete={() => setDeleteConfirm(t)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="pb-28 space-y-3">
      <div className="card-task !p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Sponsors
            </div>
            <div className="text-lg font-bold mt-0.5">
              {stats.sponsors} sponsors · {stats.total} beneficios
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {stats.withEv} con evidencia ({stats.pct}%)
              {filtered.length !== active.length && (
                <span>
                  {" "}
                  · Filtro: {filteredStats.withEv}/{filteredStats.total}
                </span>
              )}
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
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <Button
          onClick={() => void handleDownloadZip()}
          disabled={downloading}
          className="w-full gap-2"
          variant="outline"
          size="sm"
        >
          <Download className="w-4 h-4" />
          {downloading
            ? dlProgress?.message || "Preparando…"
            : "Descargar evidencias (ZIP)"}
        </Button>
      </div>

      <Input
        placeholder="Buscar sponsor o beneficio…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-10"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="all">Responsable: todos</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={fase}
          onChange={(e) => setFase(e.target.value as FaseFiltro)}
        >
          <option value="all">Fase: todas</option>
          {FASES.map((f) => (
            <option key={f} value={f}>
              {FASE_LABEL[f]}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="all">Tipo: todos</option>
          {tipoOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label.length > 48 ? `${label.slice(0, 48)}…` : label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={estado}
          onChange={(e) => setEstado(e.target.value as typeof estado)}
        >
          <option value="all">Estado: todos</option>
          <option value="pendiente">Sin evidencia</option>
          <option value="con_evidencia">Con evidencia</option>
          <option value="aprobada">Aprobadas</option>
        </select>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="flex-1 h-9 min-w-[7rem]" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Beneficio
        </Button>
        <Button size="sm" variant="outline" className="h-9 flex-1 sm:flex-none min-w-[6.5rem]" onClick={expandAll}>
          Expandir
        </Button>
        <Button size="sm" variant="outline" className="h-9 flex-1 sm:flex-none min-w-[6.5rem]" onClick={collapseAll}>
          Colapsar
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="outline" className="h-9" onClick={clearSelection}>
            Limpiar ({selected.size})
          </Button>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card">
          Nada con estos filtros
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

      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur p-3 safe-bottom">
          <div className="max-w-6xl mx-auto flex gap-2 items-center">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <select
              className="flex-1 h-10 rounded-xl border border-border bg-card px-2 text-sm"
              value={bulkOwner}
              onChange={(e) => setBulkOwner(e.target.value)}
            >
              <option value="">Asignar a…</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <Button onClick={bulkAssign} disabled={busy || !bulkOwner} className="h-10 shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Aplicar (${selected.size})`}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={busy}
              className="h-10 shrink-0"
              aria-label="Eliminar seleccionados"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <AddBenefitModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          refetch();
        }}
        defaultFase="durante_evento"
        tipoOptions={Array.from(new Set(active.map((t) => t.tipo_beneficio))).sort()}
        ownerOptions={owners}
        sponsorOptions={Array.from(new Set(active.map((t) => unifyBrand(t.marca)))).sort()}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este beneficio?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold text-foreground">Sponsor:</span>{" "}
                  {deleteConfirm ? unifyBrand(deleteConfirm.marca) : ""}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Beneficio:</span>{" "}
                  {deleteConfirm ? displayBeneficioLabel(deleteConfirm.tipo_beneficio) : ""}
                </div>
                <p>
                  Desaparecerá de las vistas y conteos del dashboard. Si tenía evidencia, también
                  dejará de mostrarse.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !deleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteConfirm) void softDeleteTasks([deleteConfirm.id]);
              }}
            >
              {busy ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {selected.size} beneficio{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Los beneficios seleccionados desaparecerán de las vistas y conteos del dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || selected.size === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void softDeleteTasks(Array.from(selected));
              }}
            >
              {busy ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InlineEditor({
  task,
  owners,
  busy,
  onSave,
  onApprove,
  onDelete,
}: {
  task: Task;
  owners: string[];
  busy: boolean;
  onSave: (task: Task, patch: Partial<Task>) => Promise<void>;
  onApprove: (task: Task) => Promise<void>;
  onDelete: () => void;
}) {
  const [responsable, setResponsable] = useState(task.responsable || "");
  const [dia, setDia] = useState(task.dia || "");
  const [hora, setHora] = useState(task.hora || "");
  const [requiereActa, setRequiereActa] = useState(isStandRecepcion(task));
  const approved = task.status === STATUS.APPROVED;
  const complete = hasRequiredEvidence({ ...task, rejected_at: null });

  useEffect(() => {
    setResponsable(task.responsable || "");
    setDia(task.dia || "");
    setHora(task.hora || "");
    setRequiereActa(isStandRecepcion(task));
  }, [task.id, task.responsable, task.dia, task.hora, task.flujo]);

  return (
    <div className="px-3 pb-3 pt-0 space-y-2 bg-muted/20">
      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-primary"
          checked={requiereActa}
          onChange={(e) => setRequiereActa(e.target.checked)}
          disabled={busy || approved}
        />
        <span className="min-w-0">
          <span className="block text-xs font-semibold leading-snug">
            Requiere acta de recepción de stand
          </span>
          <span className="block text-[10px] text-muted-foreground mt-0.5">
            Foto + firma del sponsor + horarios de entrega.
          </span>
        </span>
      </label>

      <label className="block text-[10px] uppercase font-bold text-muted-foreground">
        Responsable
        <select
          className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-xs"
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
        >
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {!owners.includes(responsable) && responsable && (
            <option value={responsable}>{responsable}</option>
          )}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[10px] uppercase font-bold text-muted-foreground">
          Día
          <Input
            className="mt-1 h-9 text-xs"
            placeholder="2026-08-13 o texto"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
          />
        </label>
        <label className="block text-[10px] uppercase font-bold text-muted-foreground">
          Hora
          <Input
            className="mt-1 h-9 text-xs"
            placeholder="14:30"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
          />
        </label>
      </div>
      {safeHttpUrl(task.evidencia_url) && (
        <a
          href={safeHttpUrl(task.evidencia_url)!}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-primary underline block"
        >
          Ver {isStandRecepcion(task) ? "foto del stand" : "evidencia"}
        </a>
      )}
      {safeHttpUrl(task.acta_recepcion_url) && (
        <a
          href={safeHttpUrl(task.acta_recepcion_url)!}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-primary underline block"
        >
          Ver acta firmada{task.firma_nombre ? ` (${task.firma_nombre})` : ""}
        </a>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          className="flex-1 h-9 min-w-[6rem]"
          disabled={busy}
          onClick={() =>
            void onSave(task, {
              responsable,
              dia: dia.trim() || null,
              hora: hora.trim() || null,
              is_timed: !!(dia.trim() || hora.trim()),
              flujo: requiereActa ? FLUJO_STAND_RECEPCION : FLUJO_SIMPLE,
            })
          }
        >
          Guardar
        </Button>
        {complete && !approved && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0"
            disabled={busy}
            onClick={() => void onApprove(task)}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Aprobar
          </Button>
        )}
        {!complete && !approved && isStandRecepcion(task) && (
          <p className="w-full text-[10px] text-muted-foreground">
            Para aprobar falta completar foto, acta firmada y ambos horarios de entrega.
          </p>
        )}
        <Button
          size="sm"
          variant="destructive"
          className="h-9 shrink-0"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Eliminar
        </Button>
      </div>
      {approved && <p className="text-[11px] text-success font-semibold">✓ Aprobada</p>}
    </div>
  );
}
