import { useEffect, useState } from "react";
import { ProfileSelector } from "@/components/ProfileSelector";
import { Dashboard } from "@/components/Dashboard";
import { EventCreateWizard } from "@/components/EventCreateWizard";
import { getProfileBySlug, type Profile } from "@/data/profiles";
import { useEvent } from "@/context/EventContext";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const STORAGE_KEY = "ctw-evidencias-profile";

const Index = () => {
  const { event, events, profiles, loading, error, refresh, setEventId } = useEvent();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!event || profiles.length === 0) {
      setProfile(null);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    const p = getProfileBySlug(profiles, stored);
    setProfile(p);
  }, [event, profiles]);

  const handleSelect = (p: Profile) => {
    localStorage.setItem(STORAGE_KEY, p.slug);
    setProfile(p);
  };

  const handleChange = () => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark:gradient-hero flex items-center justify-center">
        <div className="text-center text-foreground dark:text-white">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm opacity-80">Iniciando Evidencias CTW…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Setup requerido
          </div>
          <h1 className="text-xl font-bold mb-2">Base de datos sin schema</h1>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
        </div>
      </div>
    );
  }

  // Proceso desde cero: sin eventos → wizard de creación
  if (events.length === 0) {
    return (
      <div className="relative">
        <div className="absolute right-4 z-10" style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
          <ThemeToggle />
        </div>
        <EventCreateWizard
          fullscreen
          onDone={async (id) => {
            await refresh();
            setEventId(id);
          }}
        />
      </div>
    );
  }

  if (!profile) return <ProfileSelector onSelect={handleSelect} />;

  return <Dashboard profile={profile} onChangeProfile={handleChange} />;
};

export default Index;
