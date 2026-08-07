import type { Profile } from "@/data/profiles";
import { useEvent } from "@/context/EventContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { cn } from "@/lib/utils";

interface Props {
  onSelect: (p: Profile) => void;
}

function formatDates(starts: string | null, ends: string | null) {
  if (!starts && !ends) return null;
  const fmt = (d: string) => {
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };
  if (starts && ends && starts !== ends) return `${fmt(starts)} – ${fmt(ends)}`;
  return fmt(starts || ends || "");
}

export const ProfileSelector = ({ onSelect }: Props) => {
  const { event, events, profiles, setEventId } = useEvent();
  const dates = formatDates(event?.starts_on ?? null, event?.ends_on ?? null);

  return (
    <div className="page-home">
      <div className="px-6 pt-10 pb-8 max-w-md mx-auto">
        <div className="flex justify-end mb-6">
          <ThemeToggle className="dark:bg-white/10 dark:border-white/20 dark:text-white dark:hover:bg-white/20" />
        </div>

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground dark:text-white/60 mb-3">
            <span className="w-8 h-px bg-border dark:bg-white/40" />
            Colombia Tech Week
          </div>
          <h1 className="text-4xl font-bold leading-tight">
            Evidencias
            <br />
            <span className="text-primary">{event?.short_name || event?.name || "CTW"}</span>
          </h1>
          {dates && (
            <p className="text-sm font-medium mt-2 opacity-90">{dates}</p>
          )}
          <p className="text-muted-foreground dark:text-white/70 mt-3 text-sm">
            Selecciona tu perfil para capturar beneficios en el celular.
          </p>
        </div>

        <div className="mb-6">
          <InstallAppButton variant="banner" />
        </div>

        {events.length > 1 && (
          <label className="block mb-5">
            <span className="text-xs text-muted-foreground dark:text-white/50 uppercase tracking-wider">
              Evento
            </span>
            <select
              className="mt-1 w-full rounded-xl bg-card border border-border dark:bg-white/10 dark:border-white/15 dark:text-white px-3 py-2.5 text-sm"
              value={event?.id || ""}
              onChange={(e) => setEventId(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id} className="text-black">
                  {ev.short_name || ev.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="space-y-3">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={cn(
                "w-full rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-all text-left",
                "bg-card border border-border hover:bg-muted",
                "dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10"
              )}
            >
              <div
                className={cn(
                  "w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl shrink-0 shadow-lg",
                  p.accent
                )}
              >
                {p.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base">{p.name}</div>
                <div className="text-xs text-muted-foreground dark:text-white/60 truncate">
                  {p.role}
                </div>
              </div>
              <div className="text-muted-foreground dark:text-white/40">›</div>
            </button>
          ))}
          {profiles.length === 0 && (
            <p className="text-sm text-muted-foreground dark:text-white/50 text-center py-8">
              No hay perfiles activos en este evento.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground dark:text-white/40 text-center mt-10">
          Sin contraseña. Toca tu nombre para entrar.
        </p>
      </div>
    </div>
  );
};
