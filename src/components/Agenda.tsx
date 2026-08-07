import { useMemo } from "react";
import { useTasks, STATUS, type Task } from "@/hooks/useTasks";
import { Camera, Video, Clock, CheckCircle2, AlertCircle, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  responsable: string;
}

const stageChip = (stage: string | null | undefined) => {
  if (!stage) return null;
  const cls =
    stage === "Main Stage"
      ? "bg-violet-500/15 text-violet-700 border-violet-500/30"
      : stage === "Industry Stage"
      ? "bg-orange-500/15 text-orange-700 border-orange-500/30"
      : "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  return (
    <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border", cls)}>
      {stage}
    </span>
  );
};

const statusIcon = (s: string) => {
  if (s === STATUS.APPROVED) return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (s === STATUS.REVIEW) return <Clock className="w-4 h-4 text-amber-600" />;
  if (s === STATUS.REJECTED) return <AlertCircle className="w-4 h-4 text-destructive" />;
  return <CircleDashed className="w-4 h-4 text-muted-foreground" />;
};

const statusLabel = (s: string) =>
  s === STATUS.APPROVED ? "Aprobado" : s === STATUS.REVIEW ? "Capturado" : s === STATUS.REJECTED ? "Rechazado" : "Pendiente";

const sortKey = (t: Task) => {
  const day = t.dia?.startsWith("7") ? "1" : t.dia?.startsWith("8") ? "2" : "9";
  const hora = t.hora && !t.hora.toLowerCase().includes("confirmar") ? t.hora : "99:99";
  return `${day}-${hora}`;
};

export const Agenda = ({ responsable }: Props) => {
  const { tasks, loading } = useTasks(responsable);

  const { day7, day8, sinHora } = useMemo(() => {
    const timed = tasks.filter((t) => t.is_timed && t.hora && !t.hora.toLowerCase().includes("confirmar"));
    const day7 = timed.filter((t) => t.dia?.startsWith("7")).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const day8 = timed.filter((t) => t.dia?.startsWith("8")).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const sinHora = tasks.filter(
      (t) => !t.is_timed || !t.hora || t.hora.toLowerCase().includes("confirmar")
    );
    return { day7, day8, sinHora };
  }, [tasks]);

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Cargando agenda…</div>;
  }

  const renderItem = (t: Task) => {
    const isVideo = (t as any).media_type === "video";
    const stage = (t as any).stage as string | null;
    return (
      <div key={t.id} className="relative pl-10 pb-5">
        {/* dot */}
        <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
        <div className="card-task !p-3">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
              ⏰ {t.hora}
            </span>
            {stageChip(stage)}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                isVideo ? "bg-fuchsia-500/15 text-fuchsia-700" : "bg-sky-500/15 text-sky-700"
              )}
            >
              {isVideo ? <Video className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
              {isVideo ? "Video" : "Foto"}
            </span>
          </div>
          <div className="font-bold text-sm leading-tight">{t.marca}</div>
          <div className="text-xs text-muted-foreground line-clamp-1">{t.tipo_beneficio}</div>
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium">
            {statusIcon(t.status)} {statusLabel(t.status)}
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, items }: { title: string; items: Task[] }) =>
    items.length === 0 ? null : (
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3 px-1">
          {title}
        </h2>
        <div className="relative">
          <div className="absolute left-4 top-2 bottom-0 w-px bg-border" />
          {items.map(renderItem)}
        </div>
      </section>
    );

  return (
    <div className="pb-24">
      <Section title="📅 Jueves 7 de mayo" items={day7} />
      <Section title="📅 Viernes 8 de mayo" items={day8} />
      {sinHora.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3 px-1">
            Sin horario definido ({sinHora.length})
          </h2>
          <div className="text-xs text-muted-foreground px-1">
            Estas tareas no tienen hora — captúralas a lo largo del evento desde la pestaña Tareas.
          </div>
        </section>
      )}
    </div>
  );
};
