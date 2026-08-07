import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  benefitsToTasks,
  previewNotionImport,
  type NotionImportPreview,
} from "@/lib/notionImport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarPlus, Link2, Loader2, CheckCircle2, SkipForward } from "lucide-react";

type Props = {
  onDone: (eventId: string) => Promise<void> | void;
  /** Si true, se muestra como onboarding a pantalla completa */
  fullscreen?: boolean;
};

function slugify(v: string) {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function EventCreateWizard({ onDone, fullscreen }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [slug, setSlug] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [description, setDescription] = useState("");

  // Step 2
  const [notionToken, setNotionToken] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [preview, setPreview] = useState<NotionImportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const dateLabel = useMemo(() => {
    if (!startsOn && !endsOn) return null;
    if (startsOn && endsOn && startsOn !== endsOn) return `${startsOn} → ${endsOn}`;
    return startsOn || endsOn;
  }, [startsOn, endsOn]);

  const goStep2 = () => {
    if (!name.trim()) {
      toast.error("El nombre del evento es obligatorio");
      return;
    }
    if (!startsOn || !endsOn) {
      toast.error("Define las fechas de inicio y fin");
      return;
    }
    if (endsOn < startsOn) {
      toast.error("La fecha de fin no puede ser anterior al inicio");
      return;
    }
    if (!slug.trim()) setSlug(slugify(shortName || name));
    setStep(2);
  };

  const loadNotion = async () => {
    if (!notionToken.trim()) {
      toast.error("Pega el Internal Integration Token de Notion");
      return;
    }
    setLoadingPreview(true);
    try {
      const data = await previewNotionImport(notionToken.trim(), {
        eventFilter: eventFilter || null,
      });
      // Primera carga sin filtro: mostrar opciones de evento
      if (!eventFilter && data.eventOptions.length && !preview) {
        setPreview(data);
        toast.message("Notion conectado. Elige el Evento en CRM para filtrar.");
      } else {
        setPreview(data);
        toast.success(
          `${data.sponsors.length} sponsors · ${data.benefits.length} beneficios`
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error conectando Notion");
    } finally {
      setLoadingPreview(false);
    }
  };

  const createWithImport = async (withNotion: boolean) => {
    setBusy(true);
    try {
      const finalSlug = (slug.trim() || slugify(shortName || name)).toLowerCase();
      const { data: event, error } = await supabase
        .from("events")
        .insert({
          name: name.trim(),
          short_name: (shortName.trim() || name.trim()).slice(0, 40),
          slug: finalSlug,
          description: description.trim() || null,
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          status: "active",
        })
        .select()
        .single();

      if (error || !event) {
        toast.error(error?.message || "No se pudo crear el evento");
        setBusy(false);
        return;
      }

      await supabase.from("profiles").insert({
        event_id: event.id,
        slug: "coordinadora",
        name: "Coordinadora CS",
        role: "Control de evidencias",
        emoji: "🎛️",
        accent: "from-[#96e631] to-[#009542]",
        is_coordinator: true,
        sort_order: 0,
      });

      // Perfiles de campo desde owners de Notion
      if (withNotion && preview) {
        const owners = Array.from(
          new Set(preview.benefits.map((b) => b.owner).filter((o) => o && o !== "Sin asignar"))
        );
        if (owners.length) {
          await supabase.from("profiles").insert(
            owners.map((owner, i) => ({
              event_id: event.id,
              slug: slugify(owner) || `campo-${i + 1}`,
              name: owner,
              role: "Campo / CS",
              emoji: "📸",
              accent: "from-[#fedd5a] to-[#ff9e38]",
              is_coordinator: false,
              sort_order: i + 1,
            }))
          );
        }

        const tasks = benefitsToTasks(event.id, preview.benefits);
        // chunk insert
        for (let i = 0; i < tasks.length; i += 200) {
          const chunk = tasks.slice(i, i + 200);
          const { error: tErr } = await supabase.from("tasks").insert(chunk);
          if (tErr) {
            console.error(tErr);
            toast.error(`Evento creado, pero falló el import: ${tErr.message}`);
            await onDone(event.id);
            setBusy(false);
            return;
          }
        }
      }

      await supabase.from("survey_templates").insert({
        event_id: event.id,
        title: `Encuesta de satisfacción — ${event.short_name || event.name}`,
        description:
          "Antes de ver el informe de evidencias, cuéntanos tu experiencia como sponsor.",
      });

      // default survey questions
      const { data: tpl } = await supabase
        .from("survey_templates")
        .select("id")
        .eq("event_id", event.id)
        .maybeSingle();
      if (tpl) {
        await supabase.from("survey_questions").insert([
          {
            template_id: tpl.id,
            prompt: "¿Qué tan satisfecho estás con la entrega de beneficios?",
            question_type: "scale",
            sort_order: 0,
          },
          {
            template_id: tpl.id,
            prompt: "¿La comunicación con el equipo CS fue clara y oportuna?",
            question_type: "scale",
            sort_order: 1,
          },
          {
            template_id: tpl.id,
            prompt: "¿Recomendarías patrocinar CTW de nuevo?",
            question_type: "yes_no",
            sort_order: 2,
          },
          {
            template_id: tpl.id,
            prompt: "Comentarios o sugerencias",
            question_type: "text",
            required: false,
            sort_order: 3,
          },
        ]);
      }

      toast.success(
        withNotion
          ? `Evento listo · ${preview?.benefits.length ?? 0} beneficios importados`
          : "Evento creado (sin Notion)"
      );
      await onDone(event.id);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error creando evento");
    } finally {
      setBusy(false);
    }
  };

  const shell = fullscreen
    ? "min-h-screen bg-background text-foreground"
    : "space-y-4";

  return (
    <div className={shell}>
      {fullscreen && (
        <header className="border-b border-border px-5 py-6">
          <div className="max-w-md mx-auto">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Colombia Tech Week
            </div>
            <h1 className="text-2xl font-bold mt-1">Crear evento desde cero</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Fechas + primer input de Notion (sponsors y beneficios).
            </p>
          </div>
        </header>
      )}

      <div className={fullscreen ? "max-w-md mx-auto px-5 py-6 space-y-4" : "space-y-4"}>
        <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-wider">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`flex-1 h-1.5 rounded-full ${
                step >= n ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="card-task space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CalendarPlus className="w-4 h-4 text-primary" /> Datos del evento
            </div>
            <Input
              placeholder="Nombre completo (Colombia Tech Festival 2026)"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
            />
            <Input
              placeholder="Nombre corto (CTF 2026)"
              value={shortName}
              onChange={(e) => {
                setShortName(e.target.value);
                setSlug(slugify(e.target.value || name));
              }}
            />
            <Input
              placeholder="slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Inicio</span>
                <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Fin</span>
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </label>
            </div>
            <Textarea
              placeholder="Descripción opcional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <Button className="w-full" onClick={goStep2}>
              Continuar a Notion
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="card-task space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Link2 className="w-4 h-4 text-primary" /> Conectar Notion
            </div>
            <p className="text-xs text-muted-foreground">
              Usa un Internal Integration Token con acceso a <strong>CRM</strong> y{" "}
              <strong>Lab Beneficios</strong>. El token solo se usa para este import (no se guarda).
            </p>
            <Input
              type="password"
              placeholder="secret_… o ntn_…"
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
            />

            {preview && preview.eventOptions.length > 0 && (
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Filtrar por Evento (CRM)</span>
                <select
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {preview.eventOptions.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Button
              className="w-full"
              variant="secondary"
              onClick={loadNotion}
              disabled={loadingPreview}
            >
              {loadingPreview ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando…
                </>
              ) : preview ? (
                "Actualizar preview"
              ) : (
                "Conectar y previsualizar"
              )}
            </Button>

            {preview && (
              <div className="rounded-xl bg-muted/60 px-3 py-3 text-sm space-y-1">
                <div>
                  <strong>{preview.sponsors.length}</strong> sponsors
                </div>
                <div>
                  <strong>{preview.benefits.length}</strong> beneficios a importar
                </div>
                {dateLabel && (
                  <div className="text-xs text-muted-foreground">Fechas evento: {dateLabel}</div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button
                className="flex-1"
                disabled={!preview || preview.benefits.length === 0}
                onClick={() => setStep(3)}
              >
                Revisar
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => createWithImport(false)}
              disabled={busy}
            >
              <SkipForward className="w-4 h-4 mr-1" /> Crear sin Notion
            </Button>
          </div>
        )}

        {step === 3 && preview && (
          <div className="card-task space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary" /> Confirmar
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>
                Evento: <span className="text-foreground font-medium">{name}</span>
              </li>
              <li>
                Fechas: <span className="text-foreground font-medium">{dateLabel}</span>
              </li>
              <li>
                Sponsors: <span className="text-foreground font-medium">{preview.sponsors.length}</span>
              </li>
              <li>
                Beneficios:{" "}
                <span className="text-foreground font-medium">{preview.benefits.length}</span>
              </li>
            </ul>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
              {preview.benefits.slice(0, 40).map((b) => (
                <div key={b.id} className="px-3 py-2">
                  <div className="font-medium text-foreground">{b.sponsorName}</div>
                  <div className="text-muted-foreground truncate">
                    {b.type ? `${b.type} · ` : ""}
                    {b.name} · {b.owner}
                  </div>
                </div>
              ))}
              {preview.benefits.length > 40 && (
                <div className="px-3 py-2 text-muted-foreground">
                  +{preview.benefits.length - 40} más…
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep(2)} disabled={busy}>
                Atrás
              </Button>
              <Button className="w-full flex-[2]" onClick={() => createWithImport(true)} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creando…
                  </>
                ) : (
                  "Crear e importar"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
