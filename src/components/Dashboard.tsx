import { useState } from "react";
import { type Profile } from "@/data/profiles";
import { TaskList } from "./TaskList";
import { Agenda } from "./Agenda";
import { ControlPanel } from "./ControlPanel";
import { SponsorsBoard } from "./SponsorsBoard";
import { PendingByResponsible } from "./PendingByResponsible";
import { AdminPanel } from "./AdminPanel";
import { ThemeToggle } from "./ThemeToggle";
import { InstallAppButton } from "./InstallAppButton";
import { useEvent } from "@/context/EventContext";
import {
  LogOut,
  ListChecks,
  CalendarClock,
  ClipboardCheck,
  BarChart3,
  MailWarning,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  profile: Profile;
  onChangeProfile: () => void;
}

type Tab = "tareas" | "agenda" | "control" | "cumplimiento" | "pendientes" | "config";

export const Dashboard = ({ profile, onChangeProfile }: Props) => {
  const { event } = useEvent();
  const [tab, setTab] = useState<Tab>(profile.is_coordinator ? "cumplimiento" : "tareas");
  const isCoord = !!profile.is_coordinator;
  const shellMax = isCoord ? "max-w-3xl" : "max-w-md";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 gradient-hero text-white px-5 pt-6 pb-3 shadow-lg">
        <div className={cn("flex items-center justify-between mx-auto gap-2", shellMax)}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-xl shrink-0",
                profile.accent
              )}
            >
              {profile.emoji}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-white/60">
                {event?.short_name || "CTW"} · {profile.role}
              </div>
              <div className="font-bold text-base truncate">{profile.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <InstallAppButton variant="chip" />
            <ThemeToggle className="bg-white/10 border-white/15 text-white hover:bg-white/20" />
            <button
              onClick={onChangeProfile}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
              aria-label="Cambiar perfil"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className={cn("mx-auto mt-4 flex gap-1 bg-white/10 backdrop-blur-sm rounded-xl p-1", shellMax)}>
          {isCoord ? (
            <>
              <TabBtn active={tab === "cumplimiento"} onClick={() => setTab("cumplimiento")} icon={<BarChart3 className="w-4 h-4" />} label="Sponsors" />
              <TabBtn active={tab === "control"} onClick={() => setTab("control")} icon={<ClipboardCheck className="w-4 h-4" />} label="Control" />
              <TabBtn active={tab === "pendientes"} onClick={() => setTab("pendientes")} icon={<MailWarning className="w-4 h-4" />} label="Pendientes" />
              <TabBtn active={tab === "config"} onClick={() => setTab("config")} icon={<Settings className="w-4 h-4" />} label="Admin" />
            </>
          ) : (
            <>
              <TabBtn active={tab === "tareas"} onClick={() => setTab("tareas")} icon={<ListChecks className="w-4 h-4" />} label="Tareas" />
              <TabBtn active={tab === "agenda"} onClick={() => setTab("agenda")} icon={<CalendarClock className="w-4 h-4" />} label="Mi agenda" />
            </>
          )}
        </div>
      </header>

      <div className={cn("px-4 pt-3 mx-auto", shellMax)}>
        <InstallAppButton variant="banner" />
      </div>

      <main className={cn("px-4 pt-4 mx-auto pb-10", shellMax)}>
        {tab === "control" && isCoord && <ControlPanel />}
        {tab === "cumplimiento" && isCoord && <SponsorsBoard />}
        {tab === "pendientes" && isCoord && <PendingByResponsible />}
        {tab === "config" && isCoord && <AdminPanel />}
        {tab === "agenda" && !isCoord && <Agenda responsable={profile.name} />}
        {tab === "tareas" && !isCoord && (
          <TaskList responsable={profile.name} uploaderName={profile.name} />
        )}
      </main>
    </div>
  );
};

const TabBtn = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-all",
      active ? "bg-primary text-primary-foreground shadow" : "text-white/80 hover:text-white"
    )}
  >
    {icon} {label}
  </button>
);
