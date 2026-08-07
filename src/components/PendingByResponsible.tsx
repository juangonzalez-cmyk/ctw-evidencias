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
  FASE_EMOJI,
  FASE_TAB_ACTIVE_CLASS,
  getFase,
  type Fase,
  type FaseFiltro,
} from "@/lib/fases";

import { hasRequiredEvidence } from "@/lib/standRecepcion";

const STAGE_OPTIONS = ["Main Stage", "Industry Stage", "Workshops", "Sin stage"];

const stageOf = (t: Task): string => {
  const s = (t.stage || "").trim();
  return s || "Sin stage";
};

const isPending = (t: Task) => !t.deleted_at && (!hasRequiredEvidence(t) || !!t.rejected_at);

function csvEscape(v: any): string {
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
  if (t.speaker && t.speaker.trim()) parts.push(`🗣️ ${t.speaker.trim()}`);
  const meta = parts.length ? ` — ${parts.join(", ")}` : "";
  return `• ${sponsor} — ${t.tipo_beneficio}${meta}`;
}

function buildMessage(responsable: string, tasks: Task[], faseFilter: FaseFiltro): string {
  if (faseFilter !== "all") {
    const faseUpper = FASE_LABEL[faseFilter as Fase].toUpperCase();
    return [
      `Hola ${responsable} 👋`,
      "",
      `Te recordamos que tienes ${tasks.length} evidencia${tasks.length === 1 ? "" : "s"} pendiente${tasks.length === 1 ? "" : "s"} de subir para CTW - ${faseUpper}:`,
      "",
      ...tasks.map(buildBullet),
      "",
      "Por favor sube la evidencia lo antes posible. ¡Gracias! 🙌",
    ].join("\n");
  }
  // "Todas" → group by fase inside the message
  const buckets: Record<Fase, Task[]> = { pre_evento: [], durante_evento: [], post_evento: [] };
  for (const t of tasks) buckets[getFase(t)].push(t);
  const sections: string[] = [];
  for (const f of FASES) {
    const list = buckets[f];
    if (list.length === 0) continue;
    sections.push(`${FASE_EMOJI[f]} ${FASE_LABEL[f].toUpperCase()} (${list.length} pendiente${list.length === 1 ? "" : "s"}):`);
    sections.push(...list.map(buildBullet));
    sections.push("");
  }
  return [
    `Hola ${responsable} 👋`,
    "",
    `Te recordamos que tienes ${tasks.length} evidencia${tasks.length === 1 ? "" : "s"} pendiente${tasks.length === 1 ? "" : "s"} para CTW:`,
    "",
    ...sections,
    "Por favor sube la evidencia lo antes posible. ¡Gracias! 🙌",
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
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [sponsorFilter, setSponsorFilter] = useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [faseFilter, setFaseFilter] = useState<FaseFiltro>("durante_evento");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Pending tasks only (respect fase sub-tab)
  const pendingTasks = useMemo(
    () => tasks.filter((t) => isPending(t) && (faseFilter === "all" || getFase(t) === faseFilter)),
    [tasks, faseFilter],
  );

  // Counts per fase for sub-tab labels (over all pending, not filtered).
  const faseCounts = useMemo(() => {
    const counts: Record<Fase, number> = { pre_evento: 0, durante_evento: 0, post_evento: 0 };
    for (const t of tasks) if (isPending(t)) counts[getFase(t)]++;
    return counts;
  }, [tasks]);
  const totalAllFases = faseCounts.pre_evento + faseCounts.durante_evento + faseCounts.post_evento;

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of pendingTasks) set.add((t.responsable || "—").trim() || "—");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingTasks]);

  const sponsorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of pendingTasks) set.add(unifyBrand(t.marca));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingTasks]);

  const tipoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of pendingTasks) if (t.tipo_beneficio) set.add(t.tipo_beneficio);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingTasks]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pendingTasks.filter((t) => {
      const owner = (t.responsable || "—").trim() || "—";
      const sponsor = unifyBrand(t.marca);
      if (ownerFilter.length > 0 && !ownerFilter.includes(owner)) return false;
      if (sponsorFilter.length > 0 && !sponsorFilter.includes(sponsor)) return false;
      if (tipoFilter.length > 0 && !tipoFilter.includes(t.tipo_beneficio)) return false;
      if (stageFilter.length > 0 && !stageFilter.includes(stageOf(t))) return false;
      if (q) {
        const variants = (BRAND_GROUPS[sponsor] || [sponsor]).join(" ").toLowerCase();
        const hay = `${sponsor} ${variants} ${t.marca || ""} ${t.tipo_beneficio || ""} ${t.speaker || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pendingTasks, ownerFilter, sponsorFilter, tipoFilter, stageFilter, search]);

  // Group by responsible
  const groups = useMemo<OwnerGroup[]>(() => {
    const map: Record<string, Task[]> = {};
    for (const t of filtered) {
      const owner = (t.responsable || "—").trim() || "—";
      (map[owner] ||= []).push(t);
    }
    // Sort tasks inside each group by dia/hora for readability
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const dA = (a.dia ?? "").toString();
        const dB = (b.dia ?? "").toString();
        if (dA !== dB) return dA.localeCompare(dB, "es");
        return (a.hora || "99:99").localeCompare(b.hora || "99:99");
      });
    }
    return Object.entries(map)
      .map(([responsable, list]) => ({ responsable, tasks: list }))
      .sort((a, b) => a.responsable.localeCompare(b.responsable, "es"));
  }, [filtered]);

  const totalPending = filtered.length;

  const handleCopyOne = async (g: OwnerGroup) => {
    const ok = await copyText(buildMessage(g.responsable, g.tasks, faseFilter));
    if (ok) toast.success("Mensaje copiado al portapapeles ✓");
    else toast.error("No se pudo copiar al portapapeles");
  };

  const handleCopyAll = async () => {
    if (groups.length === 0) {
      toast.info("No hay pendientes para copiar");
      return;
    }
    const divider = "\n――――――――――――――――――――\n\n";
    const text = groups.map((g) => buildMessage(g.responsable, g.tasks, faseFilter)).join(divider);
    const ok = await copyText(text);
    if (ok) toast.success(`Mensaje con ${groups.length} responsables copiado ✓`);
    else toast.error("No se pudo copiar al portapapeles");
  };

  const faseSuffix = faseFilter === "all" ? "" : `_${faseFilter}`;

  const handleExportCsv = () => {
    const headers = ["Responsable", "Sponsor unificado", "Marca original", "Tipo de beneficio", "Fase", "Día", "Hora", "Stage", "Speaker", "Notas"];
    const rows = [headers.join(",")];
    for (const g of groups) {
      for (const t of g.tasks) {
        rows.push([
          g.responsable,
          unifyBrand(t.marca),
          t.marca || "",
          t.tipo_beneficio || "",
          FASE_LABEL[getFase(t)],
          t.dia ?? "",
          t.hora || "",
          stageOf(t),
          t.speaker || "",
          t.notas || "",
        ].map(csvEscape).join(","));
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

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Cargando pendientes…</div>;
  }

  return (
    <div className="pb-24 space-y-4">
      {/* Fase sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFaseFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all",
            faseFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-muted-foreground border-border hover:bg-accent",
          )}
        >
          Todas ({totalAllFases})
        </button>
        {FASES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFaseFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all",
              faseFilter === f
                ? FASE_TAB_ACTIVE_CLASS[f]
                : "bg-secondary text-muted-foreground border-border hover:bg-accent",
            )}
          >
            {FASE_EMOJI[f]} {FASE_LABEL[f]} ({faseCounts[f]})
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard label="Responsables" value={groups.length} />
        <SummaryCard label="Pendientes" value={totalPending} accent="text-destructive" />
      </div>

      {/* Filters */}
      <div className="card-task !p-3 space-y-3">
        <Input
          placeholder="Buscar sponsor, beneficio o speaker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />

        <ChipMultiSelect label="Responsable" options={ownerOptions} value={ownerFilter} onChange={setOwnerFilter} />
        <ChipMultiSelect label="Sponsor" options={sponsorOptions} value={sponsorFilter} onChange={setSponsorFilter} />
        <ChipMultiSelect label="Tipo de beneficio" options={tipoOptions} value={tipoFilter} onChange={setTipoFilter} />
        <ChipMultiSelect label="Stage" options={STAGE_OPTIONS} value={stageFilter} onChange={setStageFilter} />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button onClick={handleCopyAll} variant="default" className="gap-2 h-9">
            <Users className="w-4 h-4" /> Copiar todos
          </Button>
          <Button onClick={handleExportCsv} variant="outline" className="gap-2 h-9">
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="card-task !p-6 text-center text-muted-foreground text-sm">
            🎉 Sin pendientes con los filtros aplicados.
          </div>
        )}
        {groups.map((g) => {
          const open = expanded[g.responsable] ?? true;
          return (
            <div key={g.responsable} className="card-task !p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 bg-secondary/40">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [g.responsable]: !open }))}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <span className="font-bold truncate">{g.responsable}</span>
                  <span className="text-[10px] font-bold bg-destructive/15 text-destructive px-2 py-0.5 rounded-full">
                    {g.tasks.length}
                  </span>
                </button>
                <Button onClick={() => handleCopyOne(g)} size="sm" variant="outline" className="gap-1.5 h-8 text-xs shrink-0">
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </Button>
              </div>
              {open && (
                <ul className="divide-y divide-border">
                  {g.tasks.map((t) => (
                    <li key={t.id} className="px-3 py-2 text-xs">
                      <div className="font-semibold">
                        {unifyBrand(t.marca)}{" "}
                        <span className="font-normal text-muted-foreground text-[10px]">({t.marca})</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">{t.tipo_beneficio}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-1">
                        {t.dia && <span>📅 Día {t.dia}</span>}
                        {t.hora && <span>⏰ {t.hora}</span>}
                        {t.stage && <span>🎤 {t.stage}</span>}
                        {t.speaker && <span>🗣️ {t.speaker}</span>}
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

const SummaryCard = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
  <div className="card-task !p-3">
    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
    <div className={cn("text-2xl font-extrabold mt-1", accent)}>{value}</div>
  </div>
);

const ChipMultiSelect = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) => {
  if (options.length === 0) return null;
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] uppercase font-bold text-muted-foreground">{label}</div>
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-[10px] text-destructive hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
        {options.map((o) => {
          const active = value.includes(o);
          return (
            <button
              key={o}
              onClick={() => toggle(o)}
              className={cn(
                "text-[10px] px-2 py-1 rounded-full border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border"
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
};
