import { useEffect, useMemo, useState } from "react";
import { useAllTasks, STATUS, type Task } from "@/hooks/useTasks";
import { useEvent } from "@/context/EventContext";
import { supabase } from "@/integrations/supabase/client";
import { unifyBrand } from "@/lib/brands";
import { FASES, FASE_LABEL, getFase, type FaseFiltro } from "@/lib/fases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddBenefitModal } from "@/components/AddBenefitModal";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vista móvil tipo base de datos: lista compacta, filtros en dropdowns,
 * selección múltiple + asignación masiva de responsable.
 */
export function SponsorsBoard() {
  const { tasks, loading, refetch } = useAllTasks();
  const { event, profiles } = useEvent();

  const [search, setSearch] = useState("");
  const [fase, setFase] = useState<FaseFiltro>("all");
  const [owner, setOwner] = useState("all");
  const [estado, setEstado] = useState<"all" | "pendiente" | "con_evidencia" | "aprobada">("all");
  const [fecha, setFecha] = useState<"all" | "con" | "sin">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reportTokens, setReportTokens] = useState<Record<string, string>>({});

  const active = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks]);

  const sponsorNames = useMemo(
    () => Array.from(new Set(active.map((t) => unifyBrand(t.marca)))).sort((a, b) => a.localeCompare(b, "es")),
    [active]
  );

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
    window.open(`${window.location.origin}/informe/${token}`, "_blank");
  };

  const approveTask = async (task: Task) => {
    setBusy(true);
    const { error } = await supabase
      .from("tasks")
      .update({ status: STATUS.APPROVED, approved_at: new Date().toISOString() })
      .eq("id", task.id);
    setBusy(false);
    if (error) {
      toast.error("No se pudo aprobar");
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
      if (estado === "pendiente" && t.evidencia_url) return false;
      if (estado === "con_evidencia" && !t.evidencia_url) return false;
      if (estado === "aprobada" && t.status !== STATUS.APPROVED) return false;
      if (fecha === "con" && !(t.dia || t.hora)) return false;
      if (fecha === "sin" && (t.dia || t.hora)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay =
          t.marca.toLowerCase().includes(q) ||
          t.tipo_beneficio.toLowerCase().includes(q) ||
          (t.responsable || "").toLowerCase().includes(q) ||
          unifyBrand(t.marca).toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [active, fase, owner, estado, fecha, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const s = unifyBrand(t.marca);
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.tipo_beneficio || "").localeCompare(b.tipo_beneficio || "", "es"));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = active.length;
    const withEv = active.filter((t) => !!t.evidencia_url).length;
    const sponsors = new Set(active.map((t) => unifyBrand(t.marca))).size;
    return { total, withEv, sponsors, pending: total - withEv };
  }, [active]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSponsor = (items: Task[]) => {
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
    setBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("tasks")
      .update({ responsable: bulkOwner.trim(), edited_at: new Date().toISOString() })
      .in("id", ids);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} beneficios → ${bulkOwner}`);
    clearSelection();
    refetch();
  };

  const saveRow = async (task: Task, patch: Partial<Task>) => {
    setBusy(true);
    const { error } = await supabase
      .from("tasks")
      .update({ ...patch, edited_at: new Date().toISOString() })
      .eq("id", task.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Guardado");
      refetch();
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="pb-28 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
        <span>
          <strong className="text-foreground">{stats.sponsors}</strong> sponsors ·{" "}
          <strong className="text-foreground">{stats.total}</strong> beneficios
        </span>
        <span>
          <strong className="text-foreground">{stats.withEv}</strong> con evidencia
        </span>
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
          value={estado}
          onChange={(e) => setEstado(e.target.value as typeof estado)}
        >
          <option value="all">Estado: todos</option>
          <option value="pendiente">Sin evidencia</option>
          <option value="con_evidencia">Con evidencia</option>
          <option value="aprobada">Aprobadas</option>
        </select>
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
          value={fecha}
          onChange={(e) => setFecha(e.target.value as typeof fecha)}
        >
          <option value="all">Fecha: todas</option>
          <option value="con">Con fecha</option>
          <option value="sin">Sin fecha</option>
        </select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-9" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Beneficio
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="outline" className="h-9" onClick={clearSelection}>
            Limpiar ({selected.size})
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-border overflow-hidden bg-card">
        {grouped.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nada con estos filtros
          </div>
        )}
        {grouped.map(([sponsor, items]) => {
          const allOn = items.every((t) => selected.has(t.id));
          return (
            <div key={sponsor} className="border-b border-border last:border-0">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
                <button
                  type="button"
                  onClick={() => toggleSponsor(items)}
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
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{sponsor}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {items.filter((t) => t.evidencia_url).length}/{items.length} evidencias
                  </div>
                </div>
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
                  Ver informe
                </Button>
              </div>

              <ul>
                {items.map((t) => {
                  const open = expandedId === t.id;
                  const on = selected.has(t.id);
                  return (
                    <li key={t.id} className="border-t border-border/70">
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
                          onClick={() => setExpandedId(open ? null : t.id)}
                        >
                          <div className="text-xs font-medium leading-snug line-clamp-2">
                            {t.tipo_beneficio}
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
                                t.evidencia_url ? "text-success" : "text-muted-foreground"
                              )}
                            >
                              {t.evidencia_url
                                ? t.status === STATUS.APPROVED
                                  ? "OK"
                                  : "Subida"
                                : "Pendiente"}
                            </span>
                          </div>
                        </button>
                        {open ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                      </div>

                      {open && (
                        <InlineEditor
                          task={t}
                          owners={owners}
                          busy={busy}
                          onSave={saveRow}
                          onApprove={approveTask}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur p-3 safe-bottom">
          <div className="max-w-3xl mx-auto flex gap-2 items-center">
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
    </div>
  );
}

function InlineEditor({
  task,
  owners,
  busy,
  onSave,
  onApprove,
}: {
  task: Task;
  owners: string[];
  busy: boolean;
  onSave: (task: Task, patch: Partial<Task>) => Promise<void>;
  onApprove: (task: Task) => Promise<void>;
}) {
  const [responsable, setResponsable] = useState(task.responsable || "");
  const [dia, setDia] = useState(task.dia || "");
  const [hora, setHora] = useState(task.hora || "");
  const approved = task.status === STATUS.APPROVED;

  return (
    <div className="px-3 pb-3 pt-0 space-y-2 bg-muted/20">
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
      {task.evidencia_url && (
        <a
          href={task.evidencia_url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-primary underline block"
        >
          Ver evidencia
        </a>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-9"
          disabled={busy}
          onClick={() =>
            onSave(task, {
              responsable,
              dia: dia.trim() || null,
              hora: hora.trim() || null,
              is_timed: !!(dia.trim() || hora.trim()),
            })
          }
        >
          Guardar
        </Button>
        {task.evidencia_url && !approved && (
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
      </div>
      {approved && (
        <p className="text-[11px] text-success font-semibold">✓ Aprobada</p>
      )}
    </div>
  );
}
