import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEvent } from "@/context/EventContext";

export type Task = Tables<"tasks">;

export const STATUS = {
  PENDING: "pendiente",
  REVIEW: "por_validar",
  APPROVED: "aprobada",
  REJECTED: "rechazado",
} as const;

export function useTasks(responsable: string | null) {
  const { event } = useEvent();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!responsable || !event) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("event_id", event.id)
      .eq("responsable", responsable)
      .is("deleted_at", null)
      .order("dia", { ascending: true })
      .order("hora", { ascending: true })
      .limit(2000);
    if (error) console.error(error);
    else setTasks(data ?? []);
    setLoading(false);
  }, [responsable, event]);

  useEffect(() => {
    fetchTasks();
    if (!responsable || !event) return;

    const channel = supabase
      .channel(`tasks-${event.id}-${responsable}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `event_id=eq.${event.id}` },
        () => fetchTasks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [responsable, event, fetchTasks]);

  return { tasks, loading, refetch: fetchTasks };
}

export function useAllTasks() {
  const { event } = useEvent();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!event) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id,event_id,marca,tipo_beneficio,responsable,dia,hora,fase,status,evidencia_url,evidencias,media_type,deleted_at,approved_at,rejected_at,edited_at,is_timed,speaker,stage,notas,created_at,updated_at,flujo,acta_recepcion_url,firma_nombre,entrega_ctw_at,entrega_sponsor_at,tipo_entrega,category"
      )
      .eq("event_id", event.id)
      .limit(2000);
    if (error) console.error(error);
    else setTasks(data ?? []);
    setLoading(false);
  }, [event]);

  useEffect(() => {
    fetchTasks();
    if (!event) return;
    const channel = supabase
      .channel(`tasks-all-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `event_id=eq.${event.id}` },
        () => fetchTasks()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [event, fetchTasks]);

  return { tasks, loading, refetch: fetchTasks };
}
