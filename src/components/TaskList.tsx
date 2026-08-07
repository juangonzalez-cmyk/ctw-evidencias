import { useMemo, useState } from "react";
import { useTasks, STATUS, type Task } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { unifyBrand } from "@/lib/brands";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  responsable: string;
  uploaderName: string;
  relevoOf?: string;
}

function statusPriority(t: Task): number {
  if (t.status === STATUS.REJECTED) return 0;
  if (t.status === STATUS.PENDING) return 1;
  if (t.status === STATUS.REVIEW) return 2;
  return 3;
}

export const TaskList = ({ responsable, uploaderName, relevoOf }: Props) => {
  const { tasks, loading } = useTasks(responsable);
  const [search, setSearch] = useState("");
  const [openSponsors, setOpenSponsors] = useState<Record<string, boolean>>({});

  const completed = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === STATUS.REVIEW || t.status === STATUS.APPROVED
      ).length,
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

  const toggle = (sponsor: string) =>
    setOpenSponsors((s) => ({ ...s, [sponsor]: !(s[sponsor] ?? false) }));

  return (
    <div className="space-y-4 pb-24">
      <div className="card-task !p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-semibold text-muted-foreground">
            Progreso
          </span>
          <span className="text-sm font-bold">
            {completed} / {tasks.length}
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full gradient-primary transition-all"
            style={{
              width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {grouped.length} sponsor{grouped.length === 1 ? "" : "s"}
          {search.trim() ? " con este filtro" : " asignados"}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar sponsor o beneficio…"
          className="pl-9 h-11"
        />
      </div>

      {grouped.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Ningún sponsor coincide con “{search.trim()}”.
        </div>
      )}

      <div className="space-y-2">
        {grouped.map(([sponsor, items]) => {
          const isOpen = openSponsors[sponsor] ?? (search.trim().length > 0);
          const done = items.filter(
            (t) => t.status === STATUS.REVIEW || t.status === STATUS.APPROVED
          ).length;
          const pending = items.length - done;
          return (
            <section
              key={sponsor}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(sponsor)}
                className="w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{sponsor}</div>
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

              {isOpen && (
                <div className="px-3 pb-3 space-y-3 border-t border-border/70 pt-3">
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      uploaderName={uploaderName}
                      relevoOf={relevoOf}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
