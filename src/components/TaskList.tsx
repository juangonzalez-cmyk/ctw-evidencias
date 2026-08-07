import { useMemo, useState } from "react";
import { useTasks, STATUS, type Task } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  responsable: string;
  uploaderName: string;
  relevoOf?: string;
  onlyPendingOrLate?: boolean;
}

export const TaskList = ({ responsable, uploaderName, relevoOf, onlyPendingOrLate }: Props) => {
  const { tasks, loading } = useTasks(responsable);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!onlyPendingOrLate) return tasks;
    return tasks.filter(
      (t) => t.status === STATUS.PENDING || t.status === STATUS.REJECTED
    );
  }, [tasks, onlyPendingOrLate]);

  const statusPriority = (t: Task): number => {
    if (t.status === STATUS.REJECTED) return 0;
    if (t.status === STATUS.PENDING) return 1;
    if (t.status === STATUS.REVIEW) return 2;
    return 3; // APPROVED
  };

  const { timed, flexByCat, completed, total } = useMemo(() => {
    const timed = filtered
      .filter((t) => t.is_timed)
      .sort((a, b) => {
        const pa = statusPriority(a);
        const pb = statusPriority(b);
        if (pa !== pb) return pa - pb;
        const da = (a.dia || "") + (a.hora || "");
        const db = (b.dia || "") + (b.hora || "");
        return da.localeCompare(db);
      });
    const flex = filtered.filter((t) => !t.is_timed);
    const flexByCat = flex.reduce<Record<string, Task[]>>((acc, t) => {
      const k = t.category || "Otros";
      (acc[k] ||= []).push(t);
      return acc;
    }, {});
    // Sort items within each category: pending first, completed last
    for (const cat of Object.keys(flexByCat)) {
      flexByCat[cat].sort((a, b) => statusPriority(a) - statusPriority(b));
    }
    const completed = tasks.filter(
      (t) => t.status === STATUS.REVIEW || t.status === STATUS.APPROVED
    ).length;
    return { timed, flexByCat, completed, total: tasks.length };
  }, [filtered, tasks]);

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Cargando tareas…
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

  const toggle = (k: string) => setOpenCats((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="space-y-6 pb-24">
      {!onlyPendingOrLate && (
        <div className="card-task !p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-semibold text-muted-foreground">
              Progreso general
            </span>
            <span className="text-sm font-bold">
              {completed} / {total}
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full gradient-primary transition-all"
              style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {timed.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3 px-1">
            ⏰ Con horario
          </h2>
          <div className="space-y-3">
            {timed.map((t) => (
              <TaskCard key={t.id} task={t} uploaderName={uploaderName} relevoOf={relevoOf} />
            ))}
          </div>
        </section>
      )}

      {Object.entries(flexByCat).map(([cat, items]) => {
        const isOpen = openCats[cat] ?? false;
        const done = items.filter(
          (t) => t.status === STATUS.REVIEW || t.status === STATUS.APPROVED
        ).length;
        return (
          <section key={cat}>
            <button
              onClick={() => toggle(cat)}
              className="w-full flex items-center justify-between px-1 mb-3"
            >
              <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {cat}
              </h2>
              <span className="text-xs font-semibold text-muted-foreground">
                {done}/{items.length}
              </span>
            </button>
            <div
              className={cn(
                "space-y-3 overflow-hidden transition-all",
                isOpen ? "max-h-[20000px]" : "max-h-0"
              )}
            >
              {items.map((t) => (
                <TaskCard key={t.id} task={t} uploaderName={uploaderName} relevoOf={relevoOf} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
