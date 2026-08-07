import { useMemo } from "react";
import { useTasks, STATUS, type Task } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { useEvent } from "@/context/EventContext";
import { cn } from "@/lib/utils";

interface Props {
  responsable: string;
  uploaderName: string;
}

function hasRealTime(t: Task) {
  return !!(
    t.is_timed &&
    t.hora &&
    !t.hora.toLowerCase().includes("confirmar") &&
    /^\d{1,2}:\d{2}/.test(t.hora.trim())
  );
}

function dayLabel(dia: string | null, eventStart: string | null): string {
  if (!dia || !dia.trim()) return "Sin fecha";
  const raw = dia.trim();

  // ISO date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    try {
      return new Date(raw.slice(0, 10) + "T12:00:00").toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return raw;
    }
  }

  // "Día 1", "Dia 2" relative to event start
  const dayNum = raw.match(/d[ií]a\s*(\d+)/i);
  if (dayNum && eventStart) {
    try {
      const base = new Date(eventStart + "T12:00:00");
      base.setDate(base.getDate() + (Number(dayNum[1]) - 1));
      return base.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      /* fall through */
    }
  }

  return raw;
}

function sortKey(t: Task) {
  const hora = hasRealTime(t) ? t.hora!.trim() : "99:99";
  const dia = (t.dia || "").trim();
  return `${dia}|${hora}|${t.marca}`;
}

export const Agenda = ({ responsable, uploaderName }: Props) => {
  const { tasks, loading } = useTasks(responsable);
  const { event } = useEvent();

  const { byDay, sinHora, completed, total } = useMemo(() => {
    const timed = tasks.filter(hasRealTime);
    const sinHora = tasks.filter((t) => !hasRealTime(t));

    const map = new Map<string, Task[]>();
    for (const t of timed) {
      const key = (t.dia || "").trim() || "Sin día";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    }

    const byDay = Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "es", { numeric: true })
    );

    const completed = tasks.filter(
      (t) => t.status === STATUS.REVIEW || t.status === STATUS.APPROVED
    ).length;

    return { byDay, sinHora, completed, total: tasks.length };
  }, [tasks]);

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Cargando agenda…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        No hay tareas en tu agenda.
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="card-task !p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-semibold text-muted-foreground">
            Agenda con horario
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

      {byDay.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">
          No tienes beneficios con hora fija. Usa la pestaña Sponsors para verlos todos.
        </p>
      )}

      {byDay.map(([dia, items]) => (
        <section key={dia}>
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3 px-1 capitalize">
            {dayLabel(dia, event?.starts_on ?? null)}
            <span className="font-semibold normal-case text-muted-foreground/80 ml-1">
              ({items.length})
            </span>
          </h2>
          <div className="relative space-y-3">
            <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
            {items.map((t) => (
              <div key={t.id} className="relative pl-9">
                <div className="absolute left-3 top-4 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                <div
                  className={cn(
                    "mb-1.5 inline-flex text-[11px] font-bold px-2 py-0.5 rounded-md",
                    "bg-primary/15 text-primary"
                  )}
                >
                  {t.hora}
                </div>
                <TaskCard task={t} uploaderName={uploaderName} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {sinHora.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2 px-1">
            Sin horario fijo ({sinHora.length})
          </h2>
          <p className="text-xs text-muted-foreground px-1 mb-3">
            Captúralos cuando puedas — también aparecen agrupados por sponsor.
          </p>
          <div className="space-y-3">
            {sinHora
              .slice()
              .sort((a, b) =>
                (a.marca || "").localeCompare(b.marca || "", "es")
              )
              .map((t) => (
                <TaskCard key={t.id} task={t} uploaderName={uploaderName} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
};
