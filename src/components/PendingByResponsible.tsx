import { useMemo, useState } from "react";
import { useAllTasks, type Task } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND_GROUPS, unifyBrand } from "@/lib/brands";
import { toast } from "sonner";
import { Copy, Download, ChevronDown, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FASES,
  FASE_LABEL,
  getFase,
  type Fase,
  type FaseFiltro,
} from "@/lib/fases";
import { hasRequiredEvidence } from "@/lib/standRecepcion";
import { displayBeneficioLabel } from "@/lib/beneficioLabel";

const isPending = (t: Task) => !t.deleted_at && (!hasRequiredEvidence(t) || !!t.rejected_at);

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildBullet(t: Task): string {
  const sponsor = unifyBrand(t.marca);
  const parts: string[] = [];
  if (t.dia) parts.push(`Día ${t.dia}`);
  if (t.hora) parts.push(t.hora);
  if (t.stage && t.stage.trim()) parts.push(t.stage.trim());
  if (t.speaker && t.speaker.trim()) parts.push(`Speaker: ${t.speaker.trim()}`);
  const meta = parts.length ? ` — ${parts.join(", ")}` : "";
  return `• ${sponsor} — ${displayBeneficioLabel(t.tipo_beneficio)}${meta}`;
}

function buildMessage(responsable: string, tasks: Task[], faseFilter: FaseFiltro): string {
  if (faseFilter !== "all") {
    const faseUpper = FASE_LABEL[faseFilter as Fase].toUpperCase();
    return [
      `Hola ${responsable}`,
      "",
      `Te recordamos que tienes ${tasks.length} evidencia${tasks.length === 1 ? "" : "s"} pendiente${tasks.length === 1 ? "" : "s"} de subir para CTW - ${faseUpper}:`,
      "",
      ...tasks.map(buildBullet),
      "",
      "Por favor sube la evidencia lo antes posible. ¡Gracias!",
    ].join("\n");
  }
  const buckets: Record<Fase, Task[]> = { pre_evento: [], durante_evento: [], post_evento: [] };
  for (const t of tasks) buckets[getFase(t)].push(t);
  const sections: string[] = [];
  for (const f of FASES) {
    const list = buckets[f];
    if (list.length === 0) continue;
    sections.push(
      `${FASE_LABEL[f].toUpperCase()} (${list.length} pendiente${list.length === 1 ? "" : "s"}):`
    );
    sections.push(...list.map(buildBullet));
    sections.push("");
  }
  return [
    `Hola ${responsable}`,
    "",
    `Te recordamos que tienes ${tasks.length} evidencia${tasks.length === 1 ? "" : "s"} pendiente${tasks.length === 1 ? "" : "s"} para CTW:`,
    "",
    ...sections,
    "Por favor sube la evidencia lo antes posible. ¡Gracias!",
  ].join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

interface OwnerGroup {
  responsable: string;
  tasks: Task[];
}

export const PendingByResponsible = () => {
  const { tasks, loading } = useAllTasks();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [faseFilter, setFaseFilter] = useState<FaseFiltro>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pendingAll = useMemo(() => tasks.filter(isPending), [tasks]);

  const faseCounts = useMemo(() => {
    const counts: Record<Fase, number> = { pre_evento: 0, durante_evento: 0, post_evento: 0 };
    for (const t of pendingAll) counts[getFase(t)]++;
    return counts;
  }, [pendingAll]);

  const pendingTasks = useMemo(
    () => pendingAll.filter((t) => faseFilter === "all" || getFase(t) === faseFilter),
    [pendingAll, faseFilter]
  );

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of pendingAll) set.add((t.responsable || "—").trim() || "—");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingAll]);

  const tipoOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of pendingAll) {
      if (!t.tipo_beneficio) continue;
      if (!map.has(t.tipo_beneficio)) {
        map.set(t.tipo_beneficio, displayBeneficioLabel(t.tipo_beneficio));
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [pendingAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pendingTasks.filter((t) => {
      const owner = (t.responsable || "—").trim() || "—";
      if (ownerFilter !== "all" && owner !== ownerFilter) return false;
      if (tipoFilter !== "all" && t.tipo_beneficio !== tipoFilter) return false;
      if (q) {
        const sponsor = unifyBrand(t.marca);
        const variants = (BRAND_GROUPS[sponsor] || [sponsor]).join(" ").toLowerCase();
        const hay =
          `${sponsor} ${variants} ${t.marca || ""} ${t.tipo_beneficio || ""} ${t.speaker || ""} ${t.responsable || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pendingTasks, ownerFilter, tipoFilter, search]);

  const groups = useMemo<OwnerGroup[]>(() => {
    const map: Record<string, Task[]> = {};
    for (const t of filtered) {
      const owner = (t.responsable || "—").trim() || "—";
      (map[owner] ||= []).push(t);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const sA = unifyBrand(a.marca);
        const sB = unifyBrand(b.marca);
        if (sA !== sB) return sA.localeCompare(sB, "es");
        return displayBeneficioLabel(a.tipo_beneficio).localeCompare(
          displayBeneficioLabel(b.tipo_beneficio),
          "es"
        );
      });
    }
    return Object.entries(map)
      .map(([responsable, list]) => ({ responsable, tasks: list }))
      .sort((a, b) => a.responsable.localeCompare(b.responsable, "es"));
  }, [filtered]);

  const totalPending = filtered.length;

  const handleCopyOne = async (g: OwnerGroup) => {
    const ok = await copyText(buildMessage(g.responsable, g.tasks, faseFilter));
    if (ok) toast.success("Mensaje copiado");
    else toast.error("No se pudo copiar");
  };

  const handleCopyAll = async () => {
    if (groups.length === 0) {
      toast.info("No hay pendientes para copiar");
      return;
    }
    const divider = "\n――――――――――――――――――――\n\n";
    const text = groups.map((g) => buildMessage(g.responsable, g.tasks, faseFilter)).join(divider);
    const ok = await copyText(text);
    if (ok) toast.success(`Mensaje con ${groups.length} responsables copiado`);
    else toast.error("No se pudo copiar");
  };

  const faseSuffix = faseFilter === "all" ? "" : `_${faseFilter}`;

  const handleExportCsv = () => {
    const headers = [
      "Responsable",
      "Sponsor unificado",
      "Marca original",
      "Tipo de beneficio",
      "Fase",
      "Día",
      "Hora",
      "Stage",
      "Speaker",
      "Notas",
    ];
    const rows = [headers.join(",")];
    for (const g of groups) {
      for (const t of g.tasks) {
        rows.push(
          [
            g.responsable,
            unifyBrand(t.marca),
            t.marca || "",
            t.tipo_beneficio || "",
            FASE_LABEL[getFase(t)],
            t.dia ?? "",
            t.hora || "",
            t.stage || "",
            t.speaker || "",
            t.notas || "",
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pendientes_por_responsable${faseSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.responsable] = true;
    setExpanded(next);
  };

  const collapseAll = () => setExpanded({});

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">Cargando pendientes…</div>
    );
  }

  return (
    <div className="pb-24 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="card-task !p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Responsables
          </div>
          <div className="text-2xl font-extrabold mt-1">{groups.length}</div>
        </div>
        <div className="card-task !p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Pendientes
          </div>
          <div className="text-2xl font-extrabold mt-1 text-destructive">{totalPending}</div>
        </div>
      </div>

      <Input
        placeholder="Buscar sponsor, beneficio o responsable…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-10"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
        >
          <option value="all">Responsable: todos</option>
          {ownerOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={faseFilter}
          onChange={(e) => setFaseFilter(e.target.value as FaseFiltro)}
        >
          <option value="all">
            Fase: todas ({faseCounts.pre_evento + faseCounts.durante_evento + faseCounts.post_evento})
          </option>
          {FASES.map((f) => (
            <option key={f} value={f}>
              {FASE_LABEL[f]} ({faseCounts[f]})
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border border-border bg-card px-2 text-xs"
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
        >
          <option value="all">Tipo: todos</option>
          {tipoOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label.length > 48 ? `${label.slice(0, 48)}…` : label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleCopyAll} className="flex-1 gap-2 h-9 min-w-[8rem]">
          <Users className="w-4 h-4" /> Copiar todos
        </Button>
        <Button onClick={handleExportCsv} variant="outline" className="gap-2 h-9">
          <Download className="w-4 h-4" /> CSV
        </Button>
        <Button onClick={expandAll} variant="outline" className="h-9">
          Expandir
        </Button>
        <Button onClick={collapseAll} variant="outline" className="h-9">
          Colapsar
        </Button>
      </div>

      <div className="space-y-2">
        {groups.length === 0 && (
          <div className="card-task !p-6 text-center text-muted-foreground text-sm">
            Sin pendientes con estos filtros.
          </div>
        )}
        {groups.map((g) => {
          const open = expanded[g.responsable] ?? false;
          return (
            <div key={g.responsable} className="card-task !p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [g.responsable]: !open }))}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-bold truncate">{g.responsable}</span>
                  <span className="text-[10px] font-bold bg-destructive/15 text-destructive px-2 py-0.5 rounded-full">
                    {g.tasks.length}
                  </span>
                </button>
                <Button
                  onClick={() => void handleCopyOne(g)}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </Button>
              </div>
              {open && (
                <ul className="divide-y divide-border">
                  {g.tasks.map((t) => (
                    <li key={t.id} className="px-3 py-2.5 text-xs">
                      <div className="font-semibold text-sm">{unifyBrand(t.marca)}</div>
                      <div className="text-muted-foreground mt-0.5 leading-snug">
                        {displayBeneficioLabel(t.tipo_beneficio)}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-1">
                        <span>{FASE_LABEL[getFase(t)]}</span>
                        {t.dia && <span>Día {t.dia}</span>}
                        {t.hora && <span>{t.hora}</span>}
                        {t.rejected_at && (
                          <span className="text-destructive font-semibold">Rechazada</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
