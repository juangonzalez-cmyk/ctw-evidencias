import { useEffect, useMemo, useRef, useState } from "react";
import { useAllTasks, type Task, STATUS } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  CheckCircle2,
  Clock,
  Check,
  Trash2,
  RotateCcw,
  Pencil,
  Share2,
  PlayCircle,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { BRAND_GROUPS, unifyBrand } from "@/lib/brands";
import { EvidenceViewer } from "@/components/EvidenceViewer";
import { AddBenefitModal } from "@/components/AddBenefitModal";
import { useEvent } from "@/context/EventContext";
import { Plus, Sparkles } from "lucide-react";
import {
  FASES,
  FASE_LABEL,
  FASE_EMOJI,
  FASE_BADGE_CLASS,
  FASE_TAB_ACTIVE_CLASS,
  getFase,
  type Fase,
  type FaseFiltro,
} from "@/lib/fases";
import { downloadAllEvidencias, type DownloadProgress } from "@/lib/downloadEvidencias";

// Cutoff: tasks created after this timestamp are considered "manually added"
// by the coordinator (vs. originally seeded).
const MANUAL_CREATION_CUTOFF = new Date("2026-05-11T12:00:00Z").getTime();
const isManuallyCreated = (t: Task): boolean => {
  if (!t.created_at) return false;
  try { return new Date(t.created_at).getTime() >= MANUAL_CREATION_CUTOFF; } catch { return false; }
};

const hasEvidencia = (t: Task) => !!(t.evidencia_url && t.evidencia_url.trim()) && !t.rejected_at;
const isApproved = (t: Task) => t.status === STATUS.APPROVED && !t.rejected_at;
const isReview = (t: Task) =>
  !!(t.evidencia_url && t.evidencia_url.trim()) && !t.rejected_at && t.status !== STATUS.APPROVED;
const isDeleted = (t: Task) => !!t.deleted_at;

type SortKey = "sponsor" | "total" | "delivered" | "pending" | "pct" | "owner";
type SortDir = "asc" | "desc";
type ReviewVal = "review" | "approved" | "rejected_ever" | "pending";

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const REVIEW_LABELS: Record<ReviewVal, string> = {
  review: "Por revisar",
  approved: "Aprobadas",
  rejected_ever: "Rechazadas alguna vez",
  pending: "Pendientes (sin evidencia o rechazadas)",
};

interface SponsorRow {
  sponsor: string;
  tasks: Task[];          // active (non-deleted) tasks shown
  deletedTasks: Task[];   // deleted tasks shown only when toggle on
  total: number;
  delivered: number;
  pending: number;
  pct: number;
  ownerMain: string;
  ownerExtras: number;
}

const STAGE_OPTIONS = ["Main Stage", "Industry Stage", "Workshops", "Sin stage"];
const DIA_OPTIONS = ["7 de mayo", "8 de mayo", "Por confirmar"];
const DEFAULT_OWNERS = ["Juanita Buitrago", "Daniela Serrano", "Samuel Rodriguez", "Alejandro Gamboa"];

const stageOf = (t: Task): string => {
  const s = (t.stage || "").trim();
  if (!s) return "Sin stage";
  return s;
};

function pctColor(pct: number): string {
  if (pct >= 80) return "bg-success";
  if (pct >= 50) return "bg-amber-500";
  return "bg-destructive";
}

function csvEscape(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const BOGOTA_FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatBogota(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return BOGOTA_FMT.format(new Date(iso));
  } catch {
    return "";
  }
}

export const SponsorCompliance = () => {
  const { tasks, loading, refetch } = useAllTasks();
  const { event } = useEvent();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "complete">("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewVal[]>([]);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string[]>([]);
  const [faseFilter, setFaseFilter] = useState<FaseFiltro>("all");
  const [sortKey, setSortKey] = useState<SortKey>("sponsor");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showDeleted, setShowDeleted] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Task | null>(null);
  const [undoRejectTarget, setUndoRejectTarget] = useState<Task | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Task | null>(null);
  const [viewer, setViewer] = useState<{ sponsor: string; currentId: string } | null>(null);
  const [addModal, setAddModal] = useState<{ open: boolean; sponsor: string | null; locked: boolean }>({ open: false, sponsor: null, locked: false });

  const openViewer = (_items: Task[], task: Task) => {
    setViewer({ sponsor: unifyBrand(task.marca), currentId: task.id });
  };

  // Helper: matches the active fase sub-tab.
  const inFase = (t: Task) => faseFilter === "all" || getFase(t) === faseFilter;

  // Live-derived viewer data. If current is rejected, navigate among rejected siblings;
  // otherwise navigate among active siblings. Always restricted to current fase sub-tab.
  const viewerData = useMemo(() => {
    if (!viewer) return null;
    const sponsorTasks = tasks.filter(
      (t) => unifyBrand(t.marca) === viewer.sponsor && !isDeleted(t) && inFase(t),
    );
    const current =
      sponsorTasks.find((t) => t.id === viewer.currentId) ||
      tasks.find((t) => t.id === viewer.currentId) ||
      null;
    if (!current) return null;
    const sortHora = (a: Task, b: Task) =>
      (a.hora || "99:99").localeCompare(b.hora || "99:99") || a.id.localeCompare(b.id);
    const items = current.rejected_at
      ? sponsorTasks.filter((t) => !!t.rejected_at).sort(sortHora)
      : sponsorTasks
          .filter((t) => !!(t.evidencia_url && t.evidencia_url.trim()) && !t.rejected_at)
          .sort(sortHora);
    return { items, current };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, tasks, faseFilter]);


  // If the displayed task disappears entirely (e.g. deleted), close the viewer.
  useEffect(() => {
    if (viewer && !viewerData) setViewer(null);
  }, [viewer, viewerData]);

  const tipoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (!isDeleted(t) && t.tipo_beneficio) set.add(t.tipo_beneficio);
    return Array.from(set).sort();
  }, [tasks]);

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (!isDeleted(t) && t.responsable) set.add(t.responsable);
    return Array.from(set).sort();
  }, [tasks]);

  const ownerSelectOptions = useMemo(() => {
    const set = new Set<string>([...DEFAULT_OWNERS]);
    for (const t of tasks) if (t.responsable) set.add(t.responsable);
    return Array.from(set).sort();
  }, [tasks]);

  const sponsorOptions = useMemo(() => {
    const set = new Set<string>(Object.keys(BRAND_GROUPS));
    for (const t of tasks) set.add(unifyBrand(t.marca));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [tasks]);

  // Public report tokens, one per unified sponsor. Auto-creates missing rows.
  const [reportTokens, setReportTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!sponsorOptions.length || !event) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: existing } = await supabase
          .from("sponsor_reports")
          .select("sponsor_unified_name, token")
          .eq("event_id", event.id);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const r of existing ?? []) {
          map[r.sponsor_unified_name] = r.token;
        }
        const missing = sponsorOptions.filter((n) => !map[n]);
        if (missing.length) {
          const { data: created } = await supabase
            .from("sponsor_reports")
            .insert(missing.map((sponsor_unified_name) => ({
              event_id: event.id,
              sponsor_unified_name,
            })))
            .select("sponsor_unified_name, token");
          for (const r of created ?? []) {
            map[r.sponsor_unified_name] = r.token;
          }
        }
        setReportTokens(map);
      } catch (e) {
        console.error("ensure_sponsor_reports failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [sponsorOptions, event]);

  const handleCopyReportLink = async (sponsor: string) => {
    const token = reportTokens[sponsor];
    if (!token) { toast.error("Aún no hay link disponible — recarga la página"); return; }
    const url = `${window.location.origin}/informe/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado ✓ Listo para compartir con el sponsor");
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };


  // Apply task-level filters. Active vs deleted handled separately. Always within current fase.
  const passesFilters = (t: Task): boolean => {
    if (!inFase(t)) return false;
    if (tipoFilter.length > 0 && !tipoFilter.includes(t.tipo_beneficio)) return false;
    if (stageFilter !== "all" && stageOf(t) !== stageFilter) return false;
    if (ownerFilter !== "all" && t.responsable !== ownerFilter) return false;
    if (reviewFilter.length > 0) {
      const evid = !!(t.evidencia_url && t.evidencia_url.trim());
      const matches = reviewFilter.some((rv) => {
        if (rv === "review") return evid && !t.rejected_at && t.status === STATUS.REVIEW;
        if (rv === "approved") return evid && !t.rejected_at && t.status === STATUS.APPROVED;
        if (rv === "rejected_ever") return !!t.rejected_at;
        if (rv === "pending") return !evid || !!t.rejected_at;
        return false;
      });
      if (!matches) return false;
    }
    return true;
  };

  const activeFiltered = useMemo(
    () => tasks.filter((t) => !isDeleted(t) && passesFilters(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, tipoFilter, stageFilter, ownerFilter, reviewFilter, faseFilter]
  );

  const deletedFiltered = useMemo(
    () => tasks.filter((t) => isDeleted(t) && passesFilters(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, tipoFilter, stageFilter, ownerFilter, reviewFilter, faseFilter]
  );

  // Group by unified sponsor
  const sponsorRows = useMemo<SponsorRow[]>(() => {
    const groups: Record<string, { active: Task[]; deleted: Task[] }> = {};
    for (const t of activeFiltered) {
      const u = unifyBrand(t.marca);
      (groups[u] ||= { active: [], deleted: [] }).active.push(t);
    }
    if (showDeleted) {
      for (const t of deletedFiltered) {
        const u = unifyBrand(t.marca);
        (groups[u] ||= { active: [], deleted: [] }).deleted.push(t);
      }
    }

    let rows: SponsorRow[] = Object.entries(groups).map(([sponsor, { active, deleted }]) => {
      const total = active.length;
      const delivered = active.filter(hasEvidencia).length;
      const pending = total - delivered;
      const pct = total ? Math.round((delivered / total) * 100) : 0;
      const freq: Record<string, number> = {};
      for (const t of active) {
        const r = t.responsable || "—";
        freq[r] = (freq[r] || 0) + 1;
      }
      const owners = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      const ownerMain = owners[0]?.[0] || "—";
      const ownerExtras = Math.max(0, owners.length - 1);
      return { sponsor, tasks: active, deletedTasks: deleted, total, delivered, pending, pct, ownerMain, ownerExtras };
    });

    if (statusFilter === "pending") rows = rows.filter((r) => r.pending > 0);
    if (statusFilter === "complete") rows = rows.filter((r) => r.total > 0 && r.pct === 100);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => {
        if (r.sponsor.toLowerCase().includes(q)) return true;
        const variants = BRAND_GROUPS[r.sponsor] || [r.sponsor];
        return variants.some((v) => v.toLowerCase().includes(q));
      });
    }

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "sponsor": cmp = a.sponsor.localeCompare(b.sponsor, "es"); break;
        case "total": cmp = a.total - b.total; break;
        case "delivered": cmp = a.delivered - b.delivered; break;
        case "pending": cmp = a.pending - b.pending; break;
        case "pct": cmp = a.pct - b.pct; break;
        case "owner": cmp = a.ownerMain.localeCompare(b.ownerMain); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [activeFiltered, deletedFiltered, showDeleted, statusFilter, search, sortKey, sortDir]);

  // Summary recalculated based on the active fase sub-tab.
  const summary = useMemo(() => {
    const active = tasks.filter((t) => !isDeleted(t) && inFase(t));
    const total = active.length;
    const delivered = active.filter(hasEvidencia).length;
    const pending = total - delivered;
    const pct = total ? Math.round((delivered / total) * 100) : 0;
    const sponsors = new Set(active.map((t) => unifyBrand(t.marca))).size;
    const toReview = active.filter(isReview).length;
    const rejected = active.filter((t) => !!t.rejected_at).length;
    return { total, delivered, pending, pct, sponsors, toReview, rejected };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, faseFilter]);

  // Counts per fase for sub-tab labels.
  const faseCounts = useMemo(() => {
    const counts: Record<Fase, number> = { pre_evento: 0, durante_evento: 0, post_evento: 0 };
    for (const t of tasks) if (!isDeleted(t)) counts[getFase(t)]++;
    return counts;
  }, [tasks]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "sponsor" || key === "owner" ? "asc" : "desc"); }
  };

  const toggleTipo = (t: string) => {
    setTipoFilter((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const handleApprove = async (t: Task) => {
    setBusyId(t.id);
    const { error } = await supabase
      .from("tasks")
      .update({ status: STATUS.APPROVED, approved_at: new Date().toISOString() })
      .eq("id", t.id);
    setBusyId(null);
    if (error) { toast.error("Error al aprobar"); return; }
    toast.success("✓ Evidencia aprobada");
    refetch();
  };

  const handleUnapprove = async (t: Task) => {
    setBusyId(t.id);
    const { error } = await supabase
      .from("tasks")
      .update({ status: STATUS.REVIEW, approved_at: null })
      .eq("id", t.id);
    setBusyId(null);
    if (error) { toast.error("Error al quitar aprobación"); return; }
    toast.success("Aprobación retirada");
    refetch();
  };

  const handleConfirmReject = async () => {
    const t = rejectTarget;
    if (!t) return;
    setBusyId(t.id);
    const { error } = await supabase
      .from("tasks")
      .update({ status: STATUS.PENDING, rejected_at: new Date().toISOString(), approved_at: null })
      .eq("id", t.id);
    setBusyId(null);
    setRejectTarget(null);
    if (error) { toast.error("Error al rechazar"); return; }
    toast.success("🗑️ Evidencia rechazada — el beneficio volvió a pendientes");
    refetch();
  };

  const handleConfirmUndoReject = async () => {
    const t = undoRejectTarget;
    if (!t) return;
    setBusyId(t.id);
    const { error } = await supabase
      .from("tasks")
      .update({ status: STATUS.REVIEW, rejected_at: null, approved_at: null })
      .eq("id", t.id);
    setBusyId(null);
    setUndoRejectTarget(null);
    if (error) { toast.error("Error al deshacer rechazo"); return; }
    toast.success("↺ Rechazo deshecho — la evidencia volvió a 'Por revisar'");
    refetch();
  };

  const handleConfirmDelete = async () => {
    const t = deleteConfirm;
    if (!t) return;
    setBusyId(t.id);
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", t.id);
    setBusyId(null);
    if (error) { toast.error("Error al eliminar"); return; }
    setDeleteConfirm(null);
    setEditTarget(null);
    toast.success("🗑️ Beneficio eliminado del dashboard");
    refetch();
  };

  const handleRestore = async (t: Task) => {
    setBusyId(t.id);
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: null })
      .eq("id", t.id);
    setBusyId(null);
    if (error) { toast.error("Error al restaurar"); return; }
    toast.success("↺ Beneficio restaurado");
    refetch();
  };

  const handleSaveEdit = async (updates: Partial<Task>, file?: File | null) => {
    const t = editTarget;
    if (!t) return;
    setBusyId(t.id);

    const hadEvidencia = !!t.evidencia_url;
    let finalUpdates: Partial<Task> = { ...updates };

    if (file) {
      try {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${t.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("evidencias")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(path);
        const mediaType = file.type.startsWith("video/")
          ? "video"
          : file.type === "application/pdf"
          ? "pdf"
          : "photo";
        finalUpdates = {
          ...finalUpdates,
          evidencia_url: urlData.publicUrl,
          media_type: mediaType,
          status: STATUS.REVIEW,
          approved_at: null,
          rejected_at: null,
        };
      } catch (err: any) {
        setBusyId(null);
        toast.error(`Error subiendo archivo: ${err?.message || "intenta de nuevo"}`);
        return;
      }
    }

    const { error } = await supabase
      .from("tasks")
      .update({ ...finalUpdates, edited_at: new Date().toISOString() })
      .eq("id", t.id);
    setBusyId(null);
    if (error) { toast.error("Error al guardar cambios"); return; }

    if (file && hadEvidencia) toast.success("✓ Evidencia reemplazada — volvió a 'Por revisar'");
    else if (file) toast.success("✓ Evidencia subida");
    else toast.success("✓ Beneficio actualizado");

    setEditTarget(null);
    refetch();
  };

  const faseSuffix = faseFilter === "all" ? "" : `_${faseFilter}`;

  const handleExportCsv = () => {
    const headers = ["Sponsor", "Marca original", "Beneficio", "Fase", "Día", "Hora", "Stage", "Responsable", "Estado", "Aprobada en", "Rechazada en", "Editada en", "URL evidencia"];
    const lines = [headers.join(",")];
    for (const row of sponsorRows) {
      for (const t of row.tasks) {
        const estado = hasEvidencia(t)
          ? (isApproved(t) ? "Aprobada" : "Por revisar")
          : (t.rejected_at ? "Rechazada" : "Pendiente");
        lines.push([
          row.sponsor, t.marca, t.tipo_beneficio,
          FASE_LABEL[getFase(t)],
          t.dia || "", t.hora || "", stageOf(t),
          t.responsable || "", estado,
          formatBogota(t.approved_at), formatBogota(t.rejected_at), formatBogota(t.edited_at),
          t.evidencia_url || "",
        ].map(csvEscape).join(","));
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cumplimiento_sponsors${faseSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    setDlProgress(null);
    try {
      await downloadAllEvidencias((p) => setDlProgress(p), {
        eventId: event?.id,
        fase: faseFilter === "all" ? null : faseFilter,
      });
    } catch (err: any) {
      toast.error(err?.message || "Error descargando evidencias");
    } finally {
      setDownloading(false);
    }
  };

  // --- Summary card shortcuts (clickable filter presets) ---
  const tableRef = useRef<HTMLDivElement | null>(null);

  const reviewDropdownValue: string = useMemo(() => {
    if (reviewFilter.length === 0) return "all";
    if (sameSet(reviewFilter, ["review", "approved"])) return "delivered";
    if (reviewFilter.length === 1) return reviewFilter[0];
    return "all";
  }, [reviewFilter]);

  const isDefaultState =
    !search &&
    statusFilter === "all" &&
    stageFilter === "all" &&
    ownerFilter === "all" &&
    tipoFilter.length === 0 &&
    reviewFilter.length === 0;

  const activeCard: "total" | "delivered" | "pending" | "review" | "rejected" | null =
    isDefaultState
      ? "total"
      : sameSet(reviewFilter, ["review", "approved"])
      ? "delivered"
      : sameSet(reviewFilter, ["pending"])
      ? "pending"
      : sameSet(reviewFilter, ["review"])
      ? "review"
      : sameSet(reviewFilter, ["rejected_ever"])
      ? "rejected"
      : null;

  const scrollToTable = () => {
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setStageFilter("all");
    setOwnerFilter("all");
    setTipoFilter([]);
    setReviewFilter([]);
    scrollToTable();
  };

  const applyReviewPreset = (preset: ReviewVal[]) => {
    setReviewFilter(preset);
    scrollToTable();
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Cargando cumplimiento…</div>;
  }

  if (!loading && tasks.filter((t) => !t.deleted_at).length === 0) {
    return (
      <div className="card-task text-center py-10 space-y-2">
        <div className="text-lg font-bold">Sin beneficios aún</div>
        <p className="text-sm text-muted-foreground px-4">
          Importa sponsors y beneficios desde Notion al crear el evento, o agrega beneficios con el botón +.
        </p>
      </div>
    );
  }

  const SortHeader = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn("px-2 py-2 font-bold text-left", className)}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-primary">
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const totalAllFases = faseCounts.pre_evento + faseCounts.durante_evento + faseCounts.post_evento;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="pb-24 space-y-5">
      {/* Fase sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        <FaseTabBtn
          label={`Todas (${totalAllFases})`}
          active={faseFilter === "all"}
          onClick={() => setFaseFilter("all")}
        />
        {FASES.map((f) => (
          <FaseTabBtn
            key={f}
            fase={f}
            label={`${FASE_EMOJI[f]} ${FASE_LABEL[f]} (${faseCounts[f]})`}
            active={faseFilter === f}
            onClick={() => setFaseFilter(f)}
          />
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <SummaryCard
          label="Contratados"
          value={summary.total}
          clickable
          active={activeCard === "total"}
          ariaLabel="Limpiar todos los filtros y ver todos los beneficios"
          onClick={clearAllFilters}
        />
        <SummaryCard
          label="Entregados"
          value={summary.delivered}
          accent="text-success"
          clickable
          active={activeCard === "delivered"}
          ariaLabel="Ver evidencias entregadas (aprobadas y por revisar)"
          onClick={() => applyReviewPreset(["review", "approved"])}
        />
        <SummaryCard
          label="Pendientes"
          value={summary.pending}
          accent="text-destructive"
          clickable
          active={activeCard === "pending"}
          ariaLabel="Ver beneficios pendientes (sin evidencia o rechazadas)"
          onClick={() => applyReviewPreset(["pending"])}
        />
        <SummaryCard label="Cumplimiento" value={`${summary.pct}%`} accent="text-primary" />
        <SummaryCard
          label="Por revisar"
          value={summary.toReview}
          accent="text-amber-500"
          clickable
          active={activeCard === "review"}
          ariaLabel="Ver evidencias por revisar"
          onClick={() => applyReviewPreset(["review"])}
        />
        <SummaryCard
          label="🗑️ Rechazadas"
          value={summary.rejected}
          accent="text-rose-600"
          clickable={summary.rejected > 0}
          disabled={summary.rejected === 0}
          active={activeCard === "rejected"}
          ariaLabel="Ver evidencias rechazadas"
          onClick={() => applyReviewPreset(["rejected_ever"])}
        />
        <SummaryCard label="Sponsors únicos" value={summary.sponsors} />
      </div>

      {/* Filters */}
      <div className="card-task !p-3 space-y-3">
        <Input
          placeholder="Buscar sponsor (incluye variantes)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Solo con pendientes</option>
            <option value="complete">100% cumplidos</option>
          </select>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">Todos los stages</option>
            {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">Todos los responsables</option>
            {ownerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div>
          <div className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Estado de revisión</div>
          <select
            value={reviewDropdownValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") setReviewFilter([]);
              else if (v === "delivered") setReviewFilter(["review", "approved"]);
              else setReviewFilter([v as ReviewVal]);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">Todos</option>
            <option value="review">Por revisar</option>
            <option value="approved">Aprobadas</option>
            <option value="delivered">Entregadas (aprobadas + por revisar)</option>
            <option value="rejected_ever">Rechazadas alguna vez</option>
            <option value="pending">Pendientes (sin evidencia o rechazadas)</option>
          </select>
        </div>

        {tipoOptions.length > 0 && (
          <div>
            <div className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Tipo de beneficio</div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {tipoOptions.map((t) => {
                const active = tipoFilter.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTipo(t)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-full border transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border"
                    )}
                  >
                    {t}
                  </button>
                );
              })}
              {tipoFilter.length > 0 && (
                <button
                  onClick={() => setTipoFilter([])}
                  className="text-[10px] px-2 py-1 rounded-full border border-destructive/40 text-destructive"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="h-4 w-4 accent-destructive"
          />
          <span>Mostrar beneficios eliminados <span className="text-muted-foreground">(solo auditoría — no afecta conteos)</span></span>
        </label>

        <Button
          onClick={() => setAddModal({ open: true, sponsor: null, locked: false })}
          className="w-full gap-2 h-9 bg-success text-white hover:bg-success/90"
        >
          <Plus className="w-4 h-4" /> Agregar beneficio
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button onClick={handleExportCsv} variant="outline" className="w-full gap-2 h-9">
            <Download className="w-4 h-4" /> Exportar a CSV
          </Button>
          <Button
            onClick={handleDownloadZip}
            variant="outline"
            disabled={downloading}
            className="w-full gap-2 h-9"
          >
            <Download className="w-4 h-4" />
            {downloading
              ? (dlProgress?.message || "Preparando…")
              : `Descargar ZIP${faseFilter !== "all" ? ` (${FASE_LABEL[faseFilter as Fase]})` : ""}`}
          </Button>
        </div>
        {dlProgress && !dlProgress.done && (
          <div className="text-[11px] text-muted-foreground">
            {dlProgress.message}
            {dlProgress.total > 0 && ` · ${dlProgress.current}/${dlProgress.total}`}
          </div>
        )}
      </div>

      {/* Active review-filter chip */}
      {reviewFilter.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Filtro activo:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-semibold">
            {reviewDropdownValue === "delivered"
              ? "Entregadas (aprobadas + por revisar)"
              : reviewFilter.map((rv) => REVIEW_LABELS[rv]).join(" + ")}
            <button
              type="button"
              onClick={() => setReviewFilter([])}
              aria-label="Limpiar filtro de estado de revisión"
              className="hover:bg-primary/20 rounded-full w-4 h-4 inline-flex items-center justify-center leading-none"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      {/* Lista móvil de sponsors (cada uno abre sus beneficios/tareas) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold">
            {sponsorRows.length} sponsors
          </h3>
          <span className="text-xs text-muted-foreground">
            {activeFiltered.length} beneficios / tareas
          </span>
        </div>
        {sponsorRows.map((row) => {
          const open = !!expanded[row.sponsor];
          return (
            <div key={`card-${row.sponsor}`} className="card-task !p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((s) => ({ ...s, [row.sponsor]: !open }))}
                className="w-full flex items-center gap-2 px-3 py-3 text-left"
              >
                {open ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{row.sponsor}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.delivered}/{row.total} evidencias · {row.pending} pendientes · {row.ownerMain}
                  </div>
                </div>
                <div className="text-xs font-bold text-primary shrink-0">{row.pct}%</div>
              </button>
              {open && (
                <ul className="border-t border-border divide-y divide-border">
                  {row.tasks.map((t) => (
                    <li key={t.id} className="px-3 py-2.5 text-xs space-y-1">
                      <div className="font-medium leading-snug">{t.tipo_beneficio}</div>
                      <div className="text-muted-foreground flex flex-wrap gap-x-2">
                        <span>{t.responsable}</span>
                        <span>
                          {t.dia || t.hora
                            ? `${t.dia || "—"}${t.hora ? ` · ${t.hora}` : ""}`
                            : "Sin fecha"}
                        </span>
                        <span className="uppercase font-semibold">{t.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => setEditTarget(t)}
                        >
                          <Pencil className="w-3 h-3 mr-1" /> Editar / asignar
                        </Button>
                        {t.evidencia_url && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-[11px]"
                            onClick={() => openViewer(row.tasks, t)}
                          >
                            Ver evidencia
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  <li className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => setAddModal({ open: true, sponsor: row.sponsor, locked: true })}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Agregar beneficio
                    </Button>
                  </li>
                </ul>
              )}
            </div>
          );
        })}
        {sponsorRows.length === 0 && (
          <div className="card-task text-center text-sm text-muted-foreground py-8">
            Sin sponsors con los filtros aplicados. Prueba “Todas” en fases.
          </div>
        )}
      </div>

      {/* Table (desktop / scroll) */}
      <div ref={tableRef} className="card-task !p-0 overflow-hidden scroll-mt-4 hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-xs">
            <thead className="bg-secondary text-muted-foreground">
              <tr>
                <th className="w-6 px-2 py-2"></th>
                <SortHeader k="sponsor" label="Sponsor" />
                <SortHeader k="total" label="Total" />
                <SortHeader k="delivered" label="OK" />
                <SortHeader k="pending" label="Pend." />
                <SortHeader k="pct" label="% Cumpl." className="min-w-[140px]" />
                <SortHeader k="owner" label="Responsable" />
              </tr>
            </thead>
            <tbody>
              {sponsorRows.map((row) => {
                const open = !!expanded[row.sponsor];
                return (
                  <FragmentRow
                    key={row.sponsor}
                    row={row}
                    open={open}
                    onToggle={() => setExpanded((s) => ({ ...s, [row.sponsor]: !open }))}
                    busyId={busyId}
                    showFaseBadge={faseFilter === "all"}
                    onApprove={handleApprove}
                    onUnapprove={handleUnapprove}
                    onAskReject={(t) => setRejectTarget(t)}
                    onEdit={(t) => setEditTarget(t)}
                    onRestore={handleRestore}
                    onAskUndoReject={(t) => setUndoRejectTarget(t)}
                    onView={(t, list) => openViewer(list, t)}
                    onAddForSponsor={(s) => setAddModal({ open: true, sponsor: s, locked: true })}
                    onCopyReportLink={handleCopyReportLink}
                    hasReportLink={!!reportTokens[row.sponsor]}
                  />
                );
              })}
              {sponsorRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground text-xs">
                    Sin sponsors con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject confirmation */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar esta evidencia?</AlertDialogTitle>
            <AlertDialogDescription>
              El beneficio volverá a pendientes y el responsable{" "}
              <span className="font-semibold text-foreground">
                {rejectTarget?.responsable || "—"}
              </span>{" "}
              deberá subir una nueva evidencia. La evidencia anterior quedará guardada en el sistema
              para auditoría pero ya no contará como entregada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit modal */}
      <EditBenefitDialog
        task={editTarget}
        ownerOptions={ownerSelectOptions}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveEdit}
        onAskDelete={(t) => setDeleteConfirm(t)}
        busy={busyId === editTarget?.id}
      />

      {/* Evidence viewer */}
      {viewerData && (
        <EvidenceViewer
          items={viewerData.items}
          current={viewerData.current}
          onNavigate={(id) => setViewer((v) => (v ? { ...v, currentId: id } : v))}
          onClose={() => setViewer(null)}
          onApprove={handleApprove}
          onUnapprove={handleUnapprove}
          onAskReject={(t) => setRejectTarget(t)}
          onAskUndoReject={(t) => setUndoRejectTarget(t)}
          onEdit={(t) => setEditTarget(t)}
          busy={busyId === viewerData.current.id}
        />
      )}

      {/* Undo reject confirmation */}
      <AlertDialog open={!!undoRejectTarget} onOpenChange={(open) => !open && setUndoRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deshacer el rechazo de esta evidencia?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold text-foreground">Sponsor:</span>{" "}
                  {undoRejectTarget ? unifyBrand(undoRejectTarget.marca) : ""}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Beneficio:</span>{" "}
                  {undoRejectTarget?.tipo_beneficio}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Rechazada el:</span>{" "}
                  {formatBogota(undoRejectTarget?.rejected_at)}
                </div>
                <p>
                  La evidencia volverá a contar como entregada y aparecerá en estado{" "}
                  <span className="font-semibold">'Por revisar'</span>, lista para que la apruebes
                  o la rechaces de nuevo si es necesario.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUndoReject}>
              Sí, deshacer rechazo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ ¿Eliminar este beneficio?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold text-foreground">Sponsor:</span>{" "}
                  {deleteConfirm ? unifyBrand(deleteConfirm.marca) : ""}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Beneficio:</span>{" "}
                  {deleteConfirm?.tipo_beneficio}
                </div>
                <p>
                  Este beneficio desaparecerá de todas las vistas y conteos del dashboard. Si tenía
                  una evidencia subida, también dejará de aparecer.
                </p>
                <p className="text-xs text-muted-foreground">
                  Esta acción se puede revertir solo desde la base de datos (o activando “Mostrar
                  beneficios eliminados” y usando “Restaurar”).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add benefit modal */}
      <AddBenefitModal
        open={addModal.open}
        onClose={() => setAddModal({ open: false, sponsor: null, locked: false })}
        onCreated={() => refetch()}
        lockedSponsor={addModal.locked ? addModal.sponsor : null}
        defaultSponsor={!addModal.locked ? addModal.sponsor : null}
        defaultFase={faseFilter === "all" ? "durante_evento" : (faseFilter as Fase)}
        tipoOptions={tipoOptions}
        ownerOptions={ownerSelectOptions}
        sponsorOptions={sponsorOptions}
      />
    </div>
    </TooltipProvider>
  );
};

const SummaryCard = ({
  label,
  value,
  accent,
  className,
  clickable,
  active,
  disabled,
  ariaLabel,
  onClick,
}: {
  label: string;
  value: string | number;
  accent?: string;
  className?: string;
  clickable?: boolean;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}) => {
  const interactive = clickable && !disabled;
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      aria-pressed={interactive ? !!active : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? handleKey : undefined}
      className={cn(
        "card-task !p-3 relative transition-all duration-200",
        interactive && "cursor-pointer hover:shadow-md hover:bg-accent/40 group focus:outline-none focus:ring-2 focus:ring-ring",
        active && "ring-2 ring-primary border-primary",
        disabled && "opacity-60",
        className,
      )}
    >
      {interactive && (
        <ArrowRight
          className={cn(
            "absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary",
            active && "text-primary",
          )}
        />
      )}
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-extrabold mt-1", accent)}>{value}</div>
    </div>
  );
};

const FragmentRow = ({
  row,
  open,
  onToggle,
  busyId,
  showFaseBadge,
  onApprove,
  onUnapprove,
  onAskReject,
  onEdit,
  onRestore,
  onAskUndoReject,
  onView,
  onAddForSponsor,
  onCopyReportLink,
  hasReportLink,
}: {
  row: SponsorRow;
  open: boolean;
  onToggle: () => void;
  busyId: string | null;
  showFaseBadge: boolean;
  onApprove: (t: Task) => void;
  onUnapprove: (t: Task) => void;
  onAskReject: (t: Task) => void;
  onEdit: (t: Task) => void;
  onRestore: (t: Task) => void;
  onAskUndoReject: (t: Task) => void;
  onView: (t: Task, list: Task[]) => void;
  onAddForSponsor: (sponsor: string) => void;
  onCopyReportLink: (sponsor: string) => void;
  hasReportLink: boolean;
}) => {
  const activeSorted = row.tasks
    .slice()
    .sort(
      (a, b) =>
        Number(hasEvidencia(a)) - Number(hasEvidencia(b)) ||
        (a.hora || "99:99").localeCompare(b.hora || "99:99")
    );
  const allItems = [...activeSorted, ...row.deletedTasks];

  return (
    <>
      <tr onClick={onToggle} className="border-t border-border cursor-pointer hover:bg-muted/40">
        <td className="px-2 py-2 align-middle">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-2 py-2 font-semibold">
          <div className="inline-flex items-center gap-2">
            <span>{row.sponsor}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddForSponsor(row.sponsor); }}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-success/40 text-success hover:bg-success/10"
                  aria-label={`Agregar beneficio a ${row.sponsor}`}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Agregar beneficio a {row.sponsor}</TooltipContent>
            </Tooltip>
            {hasReportLink && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyReportLink(row.sponsor); }}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-primary/40 text-primary hover:bg-primary/10"
                    aria-label={`Copiar link público del informe de ${row.sponsor}`}
                  >
                    <Share2 className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copiar link público del informe</TooltipContent>
              </Tooltip>
            )}
          </div>
        </td>
        <td className="px-2 py-2">{row.total}</td>
        <td className="px-2 py-2 text-success font-semibold">{row.delivered}</td>
        <td className="px-2 py-2 text-destructive font-semibold">{row.pending}</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden min-w-[60px]">
              <div className={cn("h-full transition-all", pctColor(row.pct))} style={{ width: `${row.pct}%` }} />
            </div>
            <span className="text-[11px] font-bold w-9 text-right">{row.pct}%</span>
          </div>
        </td>
        <td className="px-2 py-2">
          <span className="font-medium">{row.ownerMain}</span>
          {row.ownerExtras > 0 && (
            <span className="text-muted-foreground text-[10px] ml-1">+{row.ownerExtras} más</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={6} className="px-2 py-3">
            <ul className="space-y-2">
              {allItems.map((t) => {
                const ok = hasEvidencia(t);
                const approved = isApproved(t);
                const busy = busyId === t.id;
                const deleted = isDeleted(t);
                const rejected = !!t.rejected_at && !deleted;
                const hasUrl = !!(t.evidencia_url && t.evidencia_url.trim());
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "border-t border-border first:border-0 pt-2 first:pt-0",
                      deleted && "opacity-60",
                      rejected && "bg-destructive/5 border-l-2 border-l-destructive/40 -ml-2 pl-2 rounded"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5">
                        {deleted ? (
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        ) : rejected && hasUrl ? (
                          <button
                            type="button"
                            onClick={() => onView(t, allItems)}
                            className="cursor-pointer hover:scale-110 transition-transform"
                            title="Ver evidencia rechazada"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                        ) : ok ? (
                          <button
                            type="button"
                            onClick={() => onView(t, allItems)}
                            className="cursor-pointer hover:scale-110 transition-transform"
                            title="Ver evidencia"
                          >
                            <CheckCircle2 className={cn("w-4 h-4", approved ? "text-success" : "text-amber-500")} />
                          </button>
                        ) : (
                          <Clock className="w-4 h-4 text-destructive" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={cn("font-semibold text-[12px] flex items-center gap-1.5 flex-wrap", deleted && "line-through")}>
                          <span>
                            {t.tipo_beneficio}{" "}
                            <span className="font-normal text-muted-foreground text-[10px]">
                              ({t.marca})
                            </span>
                          </span>
                          {showFaseBadge && (
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border no-underline",
                              FASE_BADGE_CLASS[getFase(t)]
                            )}>
                              {FASE_EMOJI[getFase(t)]} {FASE_LABEL[getFase(t)]}
                            </span>
                          )}
                          {t.edited_at && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Editado el {formatBogota(t.edited_at)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {isManuallyCreated(t) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Sparkles className="w-3 h-3 text-primary" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Creado el {formatBogota(t.created_at)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {deleted && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive no-underline">
                              Eliminado {formatBogota(t.deleted_at)}
                            </span>
                          )}
                          {rejected && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                              🗑️ Rechazada el {formatBogota(t.rejected_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                          {t.dia && <span>📅 Día {t.dia}</span>}
                          {t.hora && <span>⏰ {t.hora}</span>}
                          {t.stage && <span>🎤 {t.stage}</span>}
                          {t.speaker && <span>🗣️ {t.speaker}</span>}
                          <span>👤 {t.responsable}</span>
                          {!deleted && !rejected && (
                            ok ? (
                              approved ? (
                                <span className="font-semibold text-success">
                                  ✓ Aprobada {t.approved_at ? `el ${formatBogota(t.approved_at)}` : ""}
                                </span>
                              ) : (
                                <span className="font-semibold text-amber-600">⏳ Por revisar</span>
                              )
                            ) : (
                              <span className="font-semibold text-destructive">⏳ Pendiente</span>
                            )
                          )}
                        </div>
                        {t.notas && (
                          <div className="text-[11px] italic text-muted-foreground mt-1">
                            📝 {t.notas}
                          </div>
                        )}
                        {(ok || (rejected && hasUrl)) && t.evidencia_url && (
                          <button
                            type="button"
                            onClick={() => onView(t, allItems)}
                            className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold mt-1 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" /> Ver evidencia{rejected ? " rechazada" : ""}
                          </button>
                        )}

                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {!deleted && ok && (
                            approved ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => onUnapprove(t)}
                                className="h-7 text-[11px] gap-1"
                              >
                                <RotateCcw className="w-3 h-3" /> Quitar aprobación
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => onApprove(t)}
                                className="h-7 text-[11px] gap-1 bg-success text-white hover:bg-success/90"
                              >
                                <Check className="w-3 h-3" /> Aprobar
                              </Button>
                            )
                          )}
                          {!deleted && ok && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onAskReject(t)}
                              className="h-7 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3 h-3" /> Rechazar
                            </Button>
                          )}
                          {rejected && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onAskUndoReject(t)}
                              className="h-7 text-[11px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                            >
                              <RotateCcw className="w-3 h-3" /> Deshacer rechazo
                            </Button>
                          )}
                          {!deleted && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onEdit(t)}
                              className="h-7 text-[11px] gap-1"
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </Button>
                          )}
                          {deleted && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onRestore(t)}
                              className="h-7 text-[11px] gap-1"
                            >
                              <RotateCcw className="w-3 h-3" /> Restaurar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
};

// ====== Edit modal ======

const ACCEPTED_MIME = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const EditBenefitDialog = ({
  task,
  ownerOptions,
  onClose,
  onSave,
  onAskDelete,
  busy,
}: {
  task: Task | null;
  ownerOptions: string[];
  onClose: () => void;
  onSave: (updates: Partial<Task>, file?: File | null) => void;
  onAskDelete: (t: Task) => void;
  busy: boolean;
}) => {
  const [tipo, setTipo] = useState("");
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [stage, setStage] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [notas, setNotas] = useState("");
  const [responsable, setResponsable] = useState("");
  const [fase, setFase] = useState<Fase>("durante_evento");
  const [tipoEntrega, setTipoEntrega] = useState<"contractual" | "adicional">("contractual");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newFilePreview, setNewFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (task) {
      setTipo(task.tipo_beneficio || "");
      setDia(task.dia || "");
      setHora(task.hora || "");
      setStage(task.stage || "");
      setSpeaker(task.speaker || "");
      setNotas(task.notas || "");
      setResponsable(task.responsable || "");
      setFase(getFase(task));
      setTipoEntrega(((task as any).tipo_entrega as "contractual" | "adicional") || "contractual");
      setNewFile(null);
      setNewFilePreview(null);
    }
  }, [task]);

  useEffect(() => {
    if (!newFile) { setNewFilePreview(null); return; }
    if (newFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(newFile);
      setNewFilePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setNewFilePreview(null);
  }, [newFile]);

  const open = !!task;
  if (!task) return (
    <Dialog open={false} onOpenChange={() => onClose()}><DialogContent /></Dialog>
  );

  const sponsor = unifyBrand(task.marca);
  const estadoLabel = task.rejected_at
    ? "Rechazada (pendiente)"
    : task.status === STATUS.APPROVED
    ? "Aprobada"
    : task.evidencia_url
    ? "Por revisar"
    : "Pendiente";

  const diaInList = !dia || DIA_OPTIONS.includes(dia);
  const stageInList = !stage || STAGE_OPTIONS.includes(stage);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!ACCEPTED_MIME.includes(f.type)) {
      toast.error("Tipo de archivo no permitido. Usa imagen, video o PDF.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error("El archivo supera 50 MB.");
      return;
    }
    setNewFile(f);
  };

  const handleSubmit = () => {
    if (!tipo.trim()) { toast.error("El tipo de beneficio es obligatorio"); return; }
    if (!responsable.trim()) { toast.error("El responsable es obligatorio"); return; }
    if (!fase) { toast.error("La fase es obligatoria"); return; }
    onSave({
      tipo_beneficio: tipo.trim(),
      dia: dia.trim() || null,
      hora: hora.trim() || null,
      stage: stage.trim() || null,
      speaker: speaker.trim() || null,
      notas: notas.trim() || null,
      responsable: responsable.trim(),
      fase,
      tipo_entrega: tipoEntrega,
    } as any, newFile);
  };

  const currentIsVideo = task.evidencia_url ? /\.(mp4|webm|mov|m4v)(\?|$)/i.test(task.evidencia_url) : false;
  const currentIsPdf = task.evidencia_url ? /\.pdf(\?|$)/i.test(task.evidencia_url) : false;
  const currentIsImage = task.evidencia_url ? /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(task.evidencia_url) : false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar beneficio</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{sponsor}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Read-only context */}
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
          <div><span className="text-muted-foreground">Sponsor (marca):</span> <span className="font-semibold">{sponsor}</span> <span className="text-muted-foreground">({task.marca})</span></div>
          <div><span className="text-muted-foreground">Estado actual:</span> <span className="font-semibold">{estadoLabel}</span></div>
        </div>

        <div className="space-y-3 text-sm">
          <Field label="Tipo de beneficio *">
            <Input value={tipo} onChange={(e) => setTipo(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Día">
              <select
                value={diaInList ? dia : "__custom__"}
                onChange={(e) => setDia(e.target.value === "__custom__" ? dia : e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">—</option>
                {DIA_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                {!diaInList && <option value="__custom__">{dia}</option>}
              </select>
              {!diaInList && (
                <Input className="mt-1" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="Valor personalizado" />
              )}
            </Field>
            <Field label="Hora">
              <Input value={hora} onChange={(e) => setHora(e.target.value)} placeholder="14:30 / Por confirmar…" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Stage">
              <select
                value={stageInList ? stage : "__custom__"}
                onChange={(e) => setStage(e.target.value === "__custom__" ? stage : e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Sin stage —</option>
                {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                {!stageInList && <option value="__custom__">{stage}</option>}
              </select>
            </Field>
            <Field label="Fase *">
              <select
                value={fase}
                onChange={(e) => setFase(e.target.value as Fase)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {FASES.map((f) => (
                  <option key={f} value={f}>{FASE_EMOJI[f]} {FASE_LABEL[f]}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Tipo de entrega *">
            <select
              value={tipoEntrega}
              onChange={(e) => setTipoEntrega(e.target.value as "contractual" | "adicional")}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="contractual">Contractual</option>
              <option value="adicional">Adicional — Milla extra</option>
            </select>
          </Field>

          <Field label="Responsable *">
            <select
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">—</option>
              {ownerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Speaker">
            <Input value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
          </Field>

          <Field label="Notas">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} />
          </Field>

          {/* EVIDENCIA */}
          <div>
            <div className="text-[11px] uppercase font-bold text-muted-foreground mb-2 tracking-wider">Evidencia</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            {task.evidencia_url ? (
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
                    {currentIsImage ? (
                      <img src={task.evidencia_url} alt="" className="w-full h-full object-cover" />
                    ) : currentIsVideo ? (
                      <PlayCircle className="w-7 h-7 text-muted-foreground" />
                    ) : currentIsPdf ? (
                      <FileText className="w-7 h-7 text-muted-foreground" />
                    ) : (
                      <FileText className="w-7 h-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">Evidencia actual</div>
                    <a
                      href={task.evidencia_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Ver evidencia actual
                    </a>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    Reemplazar archivo
                  </Button>
                </div>
                {newFile && (
                  <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 flex items-center gap-2">
                    {newFilePreview ? (
                      <img src={newFilePreview} alt="" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <FileText className="w-6 h-6 text-amber-700" />
                    )}
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="font-semibold truncate">Nuevo: {newFile.name}</div>
                      <div className="text-muted-foreground">Volverá a "Por revisar" al guardar</div>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNewFile(null)}>Quitar</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border-2 border-dashed border-border p-4 text-center space-y-2">
                {newFile ? (
                  <div className="flex items-center gap-3">
                    {newFilePreview ? (
                      <img src={newFilePreview} alt="" className="w-16 h-16 object-cover rounded" />
                    ) : (
                      <FileText className="w-10 h-10 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0 text-left text-xs">
                      <div className="font-semibold truncate">{newFile.name}</div>
                      <div className="text-muted-foreground">{(newFile.size / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNewFile(null)}>Quitar</Button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold">Subir archivo de evidencia</div>
                    <div className="text-xs text-muted-foreground">
                      Imágenes (.jpg, .png, .webp), videos (.mp4), o PDFs. Máximo 50MB.
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Seleccionar archivo
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row !justify-between gap-2 sm:!justify-between">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onAskDelete(task)}
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" /> Eliminar beneficio
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button disabled={busy} onClick={handleSubmit}>Guardar cambios</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[11px] uppercase font-bold text-muted-foreground mb-1">{label}</div>
    {children}
  </div>
);

const FaseTabBtn = ({
  fase,
  label,
  active,
  onClick,
}: {
  fase?: Fase;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all",
      active
        ? fase
          ? FASE_TAB_ACTIVE_CLASS[fase]
          : "bg-primary text-primary-foreground border-primary"
        : "bg-secondary text-muted-foreground border-border hover:bg-accent",
    )}
  >
    {label}
  </button>
);
