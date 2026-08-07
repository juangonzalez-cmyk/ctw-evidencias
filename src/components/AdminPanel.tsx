import { useEffect, useState } from "react";
import { useEvent } from "@/context/EventContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Save, UserPlus } from "lucide-react";
import { EventCreateWizard } from "@/components/EventCreateWizard";

type Question = Tables<"survey_questions">;

export const AdminPanel = () => {
  const { event, events, profiles, setEventId, refresh, refreshProfiles } = useEvent();
  const [section, setSection] = useState<"evento" | "perfiles" | "encuesta">("evento");

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h2 className="text-lg font-bold">Administración</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Eventos, perfiles y encuesta del informe.
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(
          [
            ["evento", "Eventos"],
            ["perfiles", "Perfiles"],
            ["encuesta", "Encuesta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              section === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "evento" && (
        <EventsAdmin
          event={event}
          events={events}
          setEventId={setEventId}
          onRefresh={refresh}
        />
      )}
      {section === "perfiles" && event && (
        <ProfilesAdmin
          eventId={event.id}
          profiles={profiles}
          onRefresh={refreshProfiles}
        />
      )}
      {section === "encuesta" && event && <SurveyAdmin eventId={event.id} />}
    </div>
  );
};

function EventsAdmin({
  event,
  events,
  setEventId,
  onRefresh,
}: {
  event: ReturnType<typeof useEvent>["event"];
  events: ReturnType<typeof useEvent>["events"];
  setEventId: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [showWizard, setShowWizard] = useState(false);
  const [wiping, setWiping] = useState(false);

  const wipeAll = async () => {
    if (
      !confirm(
        "Esto elimina TODOS los eventos, perfiles, tareas e informes. ¿Continuar?"
      )
    ) {
      return;
    }
    setWiping(true);
    const { error } = await supabase.from("events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setWiping(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    localStorage.removeItem("ctw-evidencias-event-id");
    localStorage.removeItem("ctw-evidencias-profile");
    toast.success("Base reiniciada. Crea el evento desde cero.");
    await onRefresh();
    setShowWizard(true);
  };

  if (showWizard || events.length === 0) {
    return (
      <EventCreateWizard
        onDone={async (id) => {
          setShowWizard(false);
          await onRefresh();
          setEventId(id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-task space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Evento activo</div>
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={event?.id || ""}
          onChange={(e) => setEventId(e.target.value)}
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.short_name || ev.name} ({ev.status})
            </option>
          ))}
        </select>
        {event && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>{event.description || event.name}</p>
            {(event.starts_on || event.ends_on) && (
              <p>
                Fechas: {event.starts_on || "?"} → {event.ends_on || "?"}
              </p>
            )}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={() => setShowWizard(true)}>
        <Plus className="w-4 h-4 mr-1" /> Nuevo evento (Notion)
      </Button>

      <Button
        variant="outline"
        className="w-full text-destructive border-destructive/30"
        onClick={wipeAll}
        disabled={wiping}
      >
        <Trash2 className="w-4 h-4 mr-1" /> Reiniciar todo (empezar de cero)
      </Button>
    </div>
  );
}

function ProfilesAdmin({
  eventId,
  profiles,
  onRefresh,
}: {
  eventId: string;
  profiles: ReturnType<typeof useEvent>["profiles"];
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [slug, setSlug] = useState("");
  const [isCoord, setIsCoord] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error("Nombre y slug obligatorios");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").insert({
      event_id: eventId,
      name: name.trim(),
      role: role.trim() || "Campo",
      slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
      emoji: isCoord ? "🎛️" : "📸",
      accent: isCoord ? "from-[#96e631] to-[#009542]" : "from-[#fedd5a] to-[#ff9e38]",
      is_coordinator: isCoord,
      sort_order: profiles.length,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Perfil creado");
      setName("");
      setRole("");
      setSlug("");
      setIsCoord(false);
      await onRefresh();
    }
    setBusy(false);
  };

  const deactivate = async (id: string) => {
    const { error } = await supabase.from("profiles").update({ active: false }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Perfil desactivado");
      await onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className="card-task flex items-center gap-3">
            <div className="text-2xl">{p.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {p.role}
                {p.is_coordinator ? " · Admin" : ""}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => deactivate(p.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="card-task space-y-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <UserPlus className="w-4 h-4 text-primary" /> Nuevo perfil
        </div>
        <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Rol / stage" value={role} onChange={(e) => setRole(e.target.value)} />
        <Input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isCoord} onChange={(e) => setIsCoord(e.target.checked)} />
          Es coordinador / admin
        </label>
        <Button onClick={create} disabled={busy} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Crear perfil
        </Button>
      </div>
    </div>
  );
}

function SurveyAdmin({ eventId }: { eventId: string }) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newPrompt, setNewPrompt] = useState("");
  const [newType, setNewType] = useState<"scale" | "text" | "yes_no">("scale");

  const load = async () => {
    const { data: tpl } = await supabase
      .from("survey_templates")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();

    if (!tpl) {
      const { data: created } = await supabase
        .from("survey_templates")
        .insert({
          event_id: eventId,
          title: "Encuesta de satisfacción",
          description: "Antes de ver el informe, responde esta breve encuesta.",
        })
        .select()
        .single();
      if (!created) return;
      setTemplateId(created.id);
      setTitle(created.title);
      setDescription(created.description || "");
      setQuestions([]);
      return;
    }

    setTemplateId(tpl.id);
    setTitle(tpl.title);
    setDescription(tpl.description || "");

    const { data: qs } = await supabase
      .from("survey_questions")
      .select("*")
      .eq("template_id", tpl.id)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    setQuestions(qs ?? []);
  };

  useEffect(() => {
    void load();
  }, [eventId]);

  const saveMeta = async () => {
    if (!templateId) return;
    const { error } = await supabase
      .from("survey_templates")
      .update({ title, description })
      .eq("id", templateId);
    if (error) toast.error(error.message);
    else toast.success("Encuesta actualizada");
  };

  const addQuestion = async () => {
    if (!templateId || !newPrompt.trim()) return;
    const { error } = await supabase.from("survey_questions").insert({
      template_id: templateId,
      prompt: newPrompt.trim(),
      question_type: newType,
      sort_order: questions.length,
    });
    if (error) toast.error(error.message);
    else {
      setNewPrompt("");
      toast.success("Pregunta agregada");
      await load();
    }
  };

  const removeQuestion = async (id: string) => {
    const { error } = await supabase
      .from("survey_questions")
      .update({ active: false })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Pregunta eliminada");
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-task space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción"
          rows={3}
        />
        <Button onClick={saveMeta} className="w-full">
          <Save className="w-4 h-4 mr-1" /> Guardar encuesta
        </Button>
      </div>

      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q.id} className="card-task flex gap-2 items-start">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{q.prompt}</div>
              <div className="text-[10px] uppercase text-muted-foreground mt-1">
                {q.question_type}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => removeQuestion(q.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="card-task space-y-3">
        <Input
          placeholder="Nueva pregunta"
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
        />
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={newType}
          onChange={(e) => setNewType(e.target.value as typeof newType)}
        >
          <option value="scale">Escala 1–5</option>
          <option value="yes_no">Sí / No</option>
          <option value="text">Texto libre</option>
        </select>
        <Button onClick={addQuestion} className="w-full" variant="secondary">
          <Plus className="w-4 h-4 mr-1" /> Agregar pregunta
        </Button>
      </div>
    </div>
  );
}
