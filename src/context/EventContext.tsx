import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type EventRow = Tables<"events">;
export type ProfileRow = Tables<"profiles">;

type EventContextValue = {
  event: EventRow | null;
  events: EventRow[];
  profiles: ProfileRow[];
  loading: boolean;
  error: string | null;
  setEventId: (id: string) => void;
  refresh: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
};

const EventContext = createContext<EventContextValue | null>(null);
const STORAGE_EVENT = "ctw-evidencias-event-id";

export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  const loadProfiles = useCallback(async (eventId: string) => {
    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .eq("event_id", eventId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (err) {
      console.error(err);
      setProfiles([]);
      return;
    }
    setProfiles((data as ProfileRow[]) ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    if (!booted.current) setLoading(true);

    const { data, error: err } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (err) {
      console.error(err);
      setError(
        err.message.includes("schema cache") || err.code === "PGRST205"
          ? "Schema no aplicado. Ejecuta supabase/schema.sql en el SQL Editor de Supabase."
          : err.message
      );
      setEvents([]);
      setEvent(null);
      setProfiles([]);
      setLoading(false);
      return;
    }

    const list = data ?? [];
    setEvents(list);

    const stored = localStorage.getItem(STORAGE_EVENT);
    const active =
      list.find((e) => e.id === stored) ||
      list.find((e) => e.status === "active") ||
      list[0] ||
      null;

    setEvent(active);
    if (active) {
      localStorage.setItem(STORAGE_EVENT, active.id);
      await loadProfiles(active.id);
    } else {
      setProfiles([]);
    }
    booted.current = true;
    setLoading(false);
  }, [loadProfiles]);

  const setEventId = useCallback(
    (id: string) => {
      const next = events.find((e) => e.id === id) || null;
      setEvent(next);
      if (next) {
        localStorage.setItem(STORAGE_EVENT, next.id);
        void loadProfiles(next.id);
      }
    },
    [events, loadProfiles]
  );

  const refreshProfiles = useCallback(async () => {
    if (event) await loadProfiles(event.id);
  }, [event, loadProfiles]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      event,
      events,
      profiles,
      loading,
      error,
      setEventId,
      refresh,
      refreshProfiles,
    }),
    [event, events, profiles, loading, error, setEventId, refresh, refreshProfiles]
  );

  return (
    <EventContext.Provider value={value}>{children}</EventContext.Provider>
  );
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvent must be used within EventProvider");
  return ctx;
}
