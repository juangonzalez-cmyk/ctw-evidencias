import { useEffect, useState } from "react";
import { useEvent } from "@/context/EventContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Save, UserPlus, CalendarClock, Loader2 } from "lucide-react";
import { EventCreateWizard } from "@/components/EventCreateWizard";
import { PULPO_STAND_ENTREGAS } from "@/data/pulpoStandCronograma";
import {
  applyPulpoCronograma,
  matchPulpoCronograma,
  pulpoMatchKey,
  type PulpoMatchRow,
  type StandTaskRow,
} from "@/lib/applyPulpoCronograma";
import { formatEntregaBogota } from "@/lib/standRecepcion";
import { fetchAllPages } from "@/lib/supabasePage";
import { StandHorariosAdmin } from "@/components/StandHorariosAdmin";

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

      {event && <PulpoCronogramaAdmin eventId={event.id} />}
      {event && <StandHorariosAdmin eventId={event.id} />}

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

function PulpoCronogramaAdmin({ eventId }: { eventId: string }) {
  const { profiles } = useEvent();
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  /** Solo crea faltantes si además están marcados en la lista. */
  const [createMissing, setCreateMissing] = useState(false);
  const fieldProfiles = profiles.filter((p) => p.active !== false && !p.is_coordinator);
  const [responsable, setResponsable] = useState(
    () => fieldProfiles.find((p) => /daniela/i.test(p.name))?.name || fieldProfiles[0]?.name || ""
  );
  const [lastReport, setLastReport] = useState<string | null>(null);
  const [preview, setPreview] = useState<PulpoMatchRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!responsable && fieldProfiles[0]) setResponsable(fieldProfiles[0].name);
  }, [fieldProfiles, responsable]);

  const loadPreview = async () => {
    setPreviewBusy(true);
    try {
      const { data, error } = await fetchAllPages<StandTaskRow>((from, to) =>
        supabase
          .from("tasks")
          .select(
            "id, marca, tipo_beneficio, category, flujo, evidencia_url, acta_recepcion_url, entrega_ctw_at, entrega_sponsor_at, deleted_at"
          )
          .eq("event_id", eventId)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to)
      );
      if (error) throw error;
      const rows = matchPulpoCronograma(data);
      setPreview(rows);
      // Por defecto: solo matches existentes (nunca crear faltantes sin check explícito)
      setSelected(
        new Set(rows.filter((r) => r.status === "matched").map((r) => pulpoMatchKey(r.entrega)))
      );
    } catch (err) {
      console.error(err);
      toast.error("No se pudo previsualizar el match");
    } finally {
      setPreviewBusy(false);
    }
  };

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Si desactivan "crear faltantes", quitar checks de missing
  useEffect(() => {
    if (createMissing || !preview) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of preview) {
        if (r.status === "missing") next.delete(pulpoMatchKey(r.entrega));
      }
      return next;
    });
  }, [createMissing, preview]);

  const toggleRow = (row: PulpoMatchRow) => {
    if (row.status === "ambiguous") return;
    if (row.status === "missing" && !createMissing) {
      toast.message("Activa “Crear stands que no existan” para marcar faltantes");
      return;
    }
    const key = pulpoMatchKey(row.entrega);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectOnlyMatched = () => {
    if (!preview) return;
    setSelected(
      new Set(
        preview.filter((r) => r.status === "matched").map((r) => pulpoMatchKey(r.entrega))
      )
    );
  };

  const selectNone = () => setSelected(new Set());

  const selectAllApplicable = () => {
    if (!preview) return;
    setSelected(
      new Set(
        preview
          .filter((r) => r.status === "matched" || (createMissing && r.status === "missing"))
          .map((r) => pulpoMatchKey(r.entrega))
      )
    );
  };

  const apply = async () => {
    if (!responsable.trim()) {
      toast.error("Elige un responsable por defecto para stands nuevos");
      return;
    }
    if (selected.size === 0) {
      toast.error("Marca al menos una fila del matching para aplicar");
      return;
    }
    const selectedRows = (preview ?? []).filter((r) => selected.has(pulpoMatchKey(r.entrega)));
    const matched = selectedRows.filter((r) => r.status === "matched").length;
    const missing = selectedRows.filter((r) => r.status === "missing").length;
    if (
      !confirm(
        `Se actualizarán ~${matched} stands existentes` +
          (missing ? ` y se crearán ~${missing} faltantes` : "") +
          `.\n(${selected.size} filas marcadas)\n¿Continuar?`
      )
    ) {
      return;
    }
    setBusy(true);
    setLastReport(null);
    try {
      const result = await applyPulpoCronograma({
        eventId,
        createMissing: createMissing && missing > 0,
        defaultResponsable: responsable.trim(),
        selectedKeys: [...selected],
      });
      const lines = [
        `Actualizados: ${result.updated}`,
        `Creados: ${result.created}`,
        `Omitidos: ${result.skipped}`,
      ];
      if (result.unmatched.length) {
        lines.push(`Sin match: ${result.unmatched.join(", ")}`);
      }
      if (result.ambiguous.length) {
        lines.push(`Ambiguos: ${result.ambiguous.join(" · ")}`);
      }
      setLastReport(lines.join("\n"));
      toast.success(
        `Cronograma aplicado · ${result.updated} actualizados` +
          (result.created ? ` · ${result.created} creados` : "")
      );
      await loadPreview();
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Error al aplicar cronograma");
    } finally {
      setBusy(false);
    }
  };

  const matchedN = preview?.filter((r) => r.status === "matched").length ?? 0;
  const missingN = preview?.filter((r) => r.status === "missing").length ?? 0;
  const ambiguousN = preview?.filter((r) => r.status === "ambiguous").length ?? 0;
  const selectedMatched = preview
    ? preview.filter((r) => r.status === "matched" && selected.has(pulpoMatchKey(r.entrega))).length
    : 0;
  const selectedMissing = preview
    ? preview.filter((r) => r.status === "missing" && selected.has(pulpoMatchKey(r.entrega))).length
    : 0;

  return (
    <div className="card-task space-y-3">
      <div className="flex items-start gap-2">
        <CalendarClock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold">Cronograma Pulpo → CTW</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Carga las {PULPO_STAND_ENTREGAS.length} entregas del Excel (11–12 ago). Marca solo las
            filas que sí corresponden; lo no marcado no se toca ni se crea.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] space-y-0.5">
        {previewBusy && !preview ? (
          <span className="text-muted-foreground">Calculando match…</span>
        ) : (
          <>
            <div>
              <strong className="text-foreground">{matchedN}</strong> listos ·{" "}
              <strong className="text-foreground">{missingN}</strong> sin stand ·{" "}
              <strong className="text-foreground">{ambiguousN}</strong> ambiguos
            </div>
            <div className="text-muted-foreground">
              Seleccionados: {selectedMatched} actualizar
              {createMissing ? ` · ${selectedMissing} crear` : ""}
            </div>
          </>
        )}
      </div>

      {preview && (
        <details className="text-[10px]" open>
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            Matching marca por marca (con check)
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium hover:bg-muted"
              onClick={selectOnlyMatched}
            >
              Solo matches
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium hover:bg-muted"
              onClick={selectAllApplicable}
            >
              Todos aplicables
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium hover:bg-muted"
              onClick={selectNone}
            >
              Ninguno
            </button>
          </div>
          <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {preview.map((r) => {
              const key = pulpoMatchKey(r.entrega);
              const checked = selected.has(key);
              const disabled = r.status === "ambiguous" || (r.status === "missing" && !createMissing);
              return (
                <li key={key}>
                  <label
                    className={`flex items-start gap-2 rounded-md px-1.5 py-1 ${
                      disabled ? "opacity-55 cursor-not-allowed" : "cursor-pointer hover:bg-muted/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-primary shrink-0"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleRow(r)}
                    />
                    <span className="min-w-0 leading-snug">
                      {r.status === "matched" && (
                        <span className="text-success">
                          ✓ {r.entrega.marca} → {r.task?.marca} (Pulpo {r.entrega.fecha.slice(5)}{" "}
                          {r.entrega.hora}
                          {r.task?.entrega_ctw_at
                            ? ` · ahora ${formatEntregaBogota(r.task.entrega_ctw_at)}`
                            : " · sin hora guardada"}
                          )
                        </span>
                      )}
                      {r.status === "missing" && (
                        <span className="text-amber-700 dark:text-amber-400">
                          ○ {r.entrega.marca}
                          {r.brandHint
                            ? ` (hay marca “${r.brandHint}”, sin stand)`
                            : " (no está en el evento)"}
                          {createMissing
                            ? checked
                              ? " — se creará"
                              : " — no se creará"
                            : " — creación desactivada"}
                        </span>
                      )}
                      {r.status === "ambiguous" && (
                        <span className="text-destructive">
                          ? {r.entrega.marca} → {r.candidates.map((c) => c.marca).join(" | ")}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={createMissing}
          onChange={(e) => setCreateMissing(e.target.checked)}
        />
        Permitir crear stands que no existan (solo los marcados abajo)
      </label>

      <label className="block text-[10px] uppercase font-bold text-muted-foreground">
        Responsable por defecto (stands nuevos)
        <select
          className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-2 text-xs"
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
        >
          <option value="">Elegir…</option>
          {fieldProfiles.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => void loadPreview()}
          disabled={previewBusy || busy}
        >
          {previewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Revisar match"}
        </Button>
        <Button className="flex-1" onClick={() => void apply()} disabled={busy || selected.size === 0}>
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <CalendarClock className="w-4 h-4 mr-1" />
          )}
          Aplicar ({selected.size})
        </Button>
      </div>

      {lastReport && (
        <pre className="text-[10px] whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-muted-foreground">
          {lastReport}
        </pre>
      )}

      <p className="text-[10px] text-muted-foreground opacity-70">
        Ej. hora Bogotá: {formatEntregaBogota("2026-08-11T13:30:00.000Z")}
      </p>
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
  const [newType, setNewType] = useState<"scale" | "scale_10" | "text" | "yes_no" | "choice">(
    "scale_10"
  );
  const [newOptions, setNewOptions] = useState("");

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
          description:
            "Antes de ver el informe de evidencias debes completar esta encuesta.",
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
    const options =
      newType === "choice"
        ? newOptions
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    if (newType === "choice" && options.length < 2) {
      toast.error("Para opción de respuesta escribe al menos 2 opciones separadas por |");
      return;
    }
    const { error } = await supabase.from("survey_questions").insert({
      template_id: templateId,
      prompt: newPrompt.trim(),
      question_type: newType,
      options,
      required: true,
      sort_order: questions.length,
    });
    if (error) toast.error(error.message);
    else {
      setNewPrompt("");
      setNewOptions("");
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

  const typeLabel = (t: string) =>
    ({
      scale: "Escala 1–5",
      scale_10: "Escala 1–10",
      yes_no: "Sí / No",
      text: "Texto libre",
      choice: "Opción de respuesta",
    }[t] || t);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
        El PDF se puede descargar sin responder la encuesta. Si el sponsor la completa, las
        respuestas se incluyen en el PDF.
      </div>
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
                {typeLabel(q.question_type)}
                {q.question_type === "choice" && Array.isArray(q.options) && q.options.length > 0
                  ? ` · ${(q.options as string[]).join(" / ")}`
                  : ""}
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
          <option value="scale_10">Escala 1–10</option>
          <option value="scale">Escala 1–5</option>
          <option value="choice">Opción de respuesta</option>
          <option value="yes_no">Sí / No</option>
          <option value="text">Texto libre</option>
        </select>
        {newType === "choice" && (
          <Input
            placeholder="Opciones separadas por |  ej: Excelente|Bueno|Regular|Malo"
            value={newOptions}
            onChange={(e) => setNewOptions(e.target.value)}
          />
        )}
        <Button onClick={addQuestion} className="w-full" variant="secondary">
          <Plus className="w-4 h-4 mr-1" /> Agregar pregunta
        </Button>
      </div>
    </div>
  );
}
