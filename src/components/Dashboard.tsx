import { lazy, Suspense, useState } from "react";
import { type Profile } from "@/data/profiles";
import { ThemeToggle } from "./ThemeToggle";
import { InstallAppButton } from "./InstallAppButton";
import { RefreshAppButton } from "./RefreshAppButton";
import { useEvent } from "@/context/EventContext";
import {
  LogOut,
  Building2,
  CalendarClock,
  BarChart3,
  MailWarning,
  Settings,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isKamName } from "@/lib/kam";

const TaskList = lazy(() =>
  import("./TaskList").then((m) => ({ default: m.TaskList }))
);
const Agenda = lazy(() =>
  import("./Agenda").then((m) => ({ default: m.Agenda }))
);
const SponsorsBoard = lazy(() =>
  import("./SponsorsBoard").then((m) => ({ default: m.SponsorsBoard }))
);
const PendingByResponsible = lazy(() =>
  import("./PendingByResponsible").then((m) => ({
    default: m.PendingByResponsible,
  }))
);
const CoordCalendar = lazy(() =>
  import("./CoordCalendar").then((m) => ({ default: m.CoordCalendar }))
);
const AdminPanel = lazy(() =>
  import("./AdminPanel").then((m) => ({ default: m.AdminPanel }))
);
const SurveyResponsesView = lazy(() =>
  import("./SurveyResponsesView").then((m) => ({ default: m.SurveyResponsesView }))
);

interface Props {
  profile: Profile;
  onChangeProfile: () => void;
}

type Tab =
  | "sponsors"
  | "agenda"
  | "cumplimiento"
  | "calendario"
  | "pendientes"
  | "encuestas"
  | "config";

const TabFallback = () => (
  <div className="py-16 flex justify-center">
    <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

export const Dashboard = ({ profile, onChangeProfile }: Props) => {
  const { event } = useEvent();
  const [tab, setTab] = useState<Tab>(profile.is_coordinator ? "cumplimiento" : "sponsors");
  const isCoord = !!profile.is_coordinator;
  // Cel: angosto y cómodo; desktop: aprovecha el ancho
  const shellMax = isCoord
    ? "max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl"
    : "max-w-md md:max-w-3xl lg:max-w-5xl";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 gradient-hero text-white safe-x safe-top pb-3 shadow-lg">
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
            <RefreshAppButton className="bg-white/10 border-white/15 text-white hover:bg-white/20" />
            <InstallAppButton
              variant="icon"
              className="bg-white/10 border border-white/15 text-white hover:bg-white/20"
            />
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
              <TabBtn
                active={tab === "cumplimiento"}
                onClick={() => setTab("cumplimiento")}
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label="Sponsors"
              />
              <TabBtn
                active={tab === "calendario"}
                onClick={() => setTab("calendario")}
                icon={<CalendarClock className="w-3.5 h-3.5" />}
                label="Calendario"
              />
              <TabBtn
                active={tab === "pendientes"}
                onClick={() => setTab("pendientes")}
                icon={<MailWarning className="w-3.5 h-3.5" />}
                label="Pendientes"
              />
              <TabBtn
                active={tab === "encuestas"}
                onClick={() => setTab("encuestas")}
                icon={<MessageSquareText className="w-3.5 h-3.5" />}
                label="Encuestas"
              />
              <TabBtn
                active={tab === "config"}
                onClick={() => setTab("config")}
                icon={<Settings className="w-3.5 h-3.5" />}
                label="Admin"
              />
            </>
          ) : (
            <>
              <TabBtn
                active={tab === "sponsors"}
                onClick={() => setTab("sponsors")}
                icon={<Building2 className="w-4 h-4" />}
                label="Sponsors"
              />
              <TabBtn
                active={tab === "agenda"}
                onClick={() => setTab("agenda")}
                icon={<CalendarClock className="w-4 h-4" />}
                label="Agenda"
              />
            </>
          )}
        </div>
      </header>

      <main className={cn("px-4 pt-5 mx-auto pb-10", shellMax)}>
        <Suspense fallback={<TabFallback />}>
          {tab === "cumplimiento" && isCoord && <SponsorsBoard />}
          {tab === "calendario" && isCoord && <CoordCalendar />}
          {tab === "pendientes" && isCoord && <PendingByResponsible />}
          {tab === "encuestas" && isCoord && event?.id && (
            <SurveyResponsesView eventId={event.id} />
          )}
          {tab === "config" && isCoord && <AdminPanel />}
          {tab === "agenda" && !isCoord && (
            <Agenda responsable={profile.name} uploaderName={profile.name} />
          )}
          {tab === "sponsors" && !isCoord && (
            <TaskList
              responsable={profile.name}
              uploaderName={profile.name}
              kamView={isKamName(profile.name)}
            />
          )}
        </Suspense>
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
      "flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs font-semibold py-2 rounded-lg transition-all",
      active ? "bg-primary text-primary-foreground shadow" : "text-white/80 hover:text-white"
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);
