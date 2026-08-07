import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BRAND_GROUPS } from "@/lib/brands";
import { FASES, FASE_EMOJI, FASE_LABEL, type Fase } from "@/lib/fases";
import { useEvent } from "@/context/EventContext";
import { FileImage, FileVideo, FileText, X } from "lucide-react";

const STAGE_OPTIONS = ["Main Stage", "Industry Stage", "Workshops", "Sin stage / N/A"];
const DIA_OPTIONS = ["Por confirmar", "Día 1", "Día 2", "Día 3"];

// Predefined types with optional extra inputs
type Predef = {
  key: string;
  label: string;
  extra?: "count" | "percent" | "count_videos";
  defaultN?: number;
  build: (n: number) => string;
};

const PREDEF: Predef[] = [
  { key: "pases_generales", label: "Pases generales", extra: "count", defaultN: 1, build: (n) => `Pases generales (${n})` },
  { key: "stand_2x2", label: "Stand 2x2 (acta de recepción)", build: () => "Stand 2x2" },
  { key: "stand_3x3", label: "Stand 3x3 (acta de recepción)", build: () => "Stand 3x3" },
  { key: "stand_4x4", label: "Stand 4x4 (acta de recepción)", build: () => "Stand 4x4" },
  { key: "carrusel", label: "Carrusel digital en colaboración", build: () => "Carrusel digital en colaboración" },
  { key: "desc_entradas", label: "10% descuento en entradas", build: () => "10% descuento en entradas" },
  { key: "desc_addons", label: "Descuento en add-ons", extra: "percent", defaultN: 10, build: (n) => `${n}% de descuento en add-ons` },
  { key: "newsletter", label: "Inclusión en newsletter", build: () => "Inclusión en newsletter" },
  { key: "video", label: "Video colaborativo en redes sociales", extra: "count_videos", defaultN: 1, build: (n) => `${n} ${n === 1 ? "video colaborativo" : "videos colaborativos"} en redes sociales` },
  { key: "prensa", label: "Menciones en prensa", extra: "count", defaultN: 3, build: (n) => `${n} menciones en prensa` },
  { key: "post_bienvenida", label: "Post de bienvenida en redes sociales", build: () => "Post de bienvenida en redes sociales" },
  { key: "base_datos", label: "100% acceso a base de datos de registro", build: () => "100% acceso a base de datos de registro" },
];

const isStandTipo = (tipo: string, predefKey: string) =>
  predefKey.startsWith("stand_") || /^Stand\s+\d/i.test(tipo) || /acta de recepción/i.test(tipo);

const ALLOWED_MIME = /^(image\/(jpeg|jpg|png|webp|gif|heic)|video\/(mp4|quicktime|webm)|application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/(plain|csv))$/i;
const MAX_SIZE = 50 * 1024 * 1024;

export interface AddBenefitModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  // Pre-fill / lock options
  lockedSponsor?: string | null; // unified sponsor name; if set, sponsor field is disabled
  defaultSponsor?: string | null; // unified sponsor name to pre-select (editable)
  defaultFase?: Fase;
  // Data sources from parent
  tipoOptions: string[];
  ownerOptions: string[];
  sponsorOptions: string[]; // unified sponsor names available
}

export const AddBenefitModal = ({
  open,
  onClose,
  onCreated,
  lockedSponsor,
  defaultSponsor,
  defaultFase = "durante_evento",
  tipoOptions,
  ownerOptions,
  sponsorOptions,
}: AddBenefitModalProps) => {
  const { event } = useEvent();
  const [sponsor, setSponsor] = useState<string>("");
  const [sponsorQuery, setSponsorQuery] = useState<string>("");
  const [fase, setFase] = useState<Fase>(defaultFase);

  // Tipo selection modes
  const [tipoMode, setTipoMode] = useState<"existing" | "predef" | "custom" | "">("");
  const [existingTipo, setExistingTipo] = useState<string>("");
  const [predefKey, setPredefKey] = useState<string>("");
  const [predefN, setPredefN] = useState<number>(1);
  const [customTipo, setCustomTipo] = useState<string>("");

  const [responsable, setResponsable] = useState<string>("");
  const [ownerCustom, setOwnerCustom] = useState<string>("");
  const [useOwnerCustom, setUseOwnerCustom] = useState(false);

  const [dia, setDia] = useState<string>("");
  const [diaCustom, setDiaCustom] = useState<string>("");
  const [useDiaCustom, setUseDiaCustom] = useState(false);

  const [hora, setHora] = useState<string>("");
  const [stage, setStage] = useState<string>("");
  const [speaker, setSpeaker] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [requiereActa, setRequiereActa] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSponsor(lockedSponsor || defaultSponsor || "");
    setSponsorQuery(lockedSponsor || defaultSponsor || "");
    setFase(defaultFase);
    resetItemFields();
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetItemFields = () => {
    setTipoMode("");
    setExistingTipo("");
    setPredefKey("");
    setPredefN(1);
    setCustomTipo("");
    setResponsable("");
    setOwnerCustom("");
    setUseOwnerCustom(false);
    setDia("");
    setDiaCustom("");
    setUseDiaCustom(false);
    setHora("");
    setStage("");
    setSpeaker("");
    setNotas("");
    setRequiereActa(false);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const filteredSponsors = useMemo(() => {
    const q = sponsorQuery.trim().toLowerCase();
    if (!q) return sponsorOptions.slice(0, 50);
    return sponsorOptions.filter((s) => s.toLowerCase().includes(q)).slice(0, 50);
  }, [sponsorQuery, sponsorOptions]);

  const currentPredef = PREDEF.find((p) => p.key === predefKey);

  const buildTipoBeneficio = (): string => {
    if (tipoMode === "existing") return existingTipo.trim();
    if (tipoMode === "custom") return customTipo.trim();
    if (tipoMode === "predef" && currentPredef) {
      return currentPredef.build(predefN || currentPredef.defaultN || 1);
    }
    return "";
  };

  const isDirty = (): boolean => {
    if (file) return true;
    if (tipoMode) return true;
    if (responsable || ownerCustom) return true;
    if (dia || diaCustom || hora || stage || speaker || notas) return true;
    if (!lockedSponsor && sponsor) return true;
    return false;
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!sponsor.trim()) errs.sponsor = "Sponsor obligatorio";
    if (!fase) errs.fase = "Fase obligatoria";
    const tipo = buildTipoBeneficio();
    if (!tipo) errs.tipo = "Tipo de beneficio obligatorio";
    if (tipoMode === "predef" && currentPredef?.extra && (!predefN || predefN < 1)) {
      errs.tipo = "Completa el campo numérico";
    }
    if (tipoMode === "predef" && currentPredef?.extra === "percent" && (predefN < 1 || predefN > 100)) {
      errs.tipo = "Porcentaje debe estar entre 1 y 100";
    }
    const finalOwner = useOwnerCustom ? ownerCustom.trim() : responsable.trim();
    if (!finalOwner) errs.responsable = "Responsable obligatorio";
    if (file) {
      if (file.size > MAX_SIZE) errs.file = "El archivo excede 50MB";
      else if (!ALLOWED_MIME.test(file.type) && !/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i.test(file.name))
        errs.file = "Tipo no permitido (imagen, video o documento)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Map unified sponsor name -> first variant of BRAND_GROUPS, else use as-is
  const resolveMarca = (unified: string): string => {
    const variants = BRAND_GROUPS[unified];
    if (variants && variants.length > 0) return variants[0];
    return unified;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE) {
      toast.error("El archivo excede 50MB");
      e.target.value = "";
      setFile(null);
      return;
    }
    if (!ALLOWED_MIME.test(f.type) && !/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i.test(f.name)) {
      toast.error("Tipo no permitido. Usa imagen, video o documento.");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  };

  const doSave = async (keepOpen: boolean) => {
    if (!validate()) {
      toast.error("Revisa los campos marcados");
      return;
    }
    if (!event) {
      toast.error("No hay evento activo");
      return;
    }
    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      const tipo = buildTipoBeneficio();
      const finalOwner = useOwnerCustom ? ownerCustom.trim() : responsable.trim();
      const finalDia = useDiaCustom ? diaCustom.trim() : dia.trim();
      const finalStage = stage === "Sin stage / N/A" ? null : (stage.trim() || null);

      let evidenciaUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${event.id}/${id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("evidencias")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          console.error(upErr);
          toast.error("Error subiendo evidencia. Inténtalo de nuevo.");
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(path);
        evidenciaUrl = urlData.publicUrl;
      }

      const status = evidenciaUrl ? "por_validar" : "pendiente";
      const marca = resolveMarca(sponsor.trim());
      const standFlow = requiereActa || isStandTipo(tipo, predefKey);
      // Stands: foto sola no alcanza; quedan pendientes hasta acta + horarios
      const finalStatus = standFlow ? "pendiente" : status;

      const { error: insErr } = await supabase.from("tasks").insert({
        id,
        event_id: event.id,
        marca,
        tipo_beneficio: tipo,
        fase,
        responsable: finalOwner,
        dia: finalDia || null,
        hora: hora.trim() || null,
        stage: finalStage,
        speaker: speaker.trim() || null,
        notas: notas.trim() || null,
        status: finalStatus,
        evidencia_url: evidenciaUrl,
        hora_subida: evidenciaUrl ? new Date().toISOString() : null,
        media_type: file?.type.startsWith("video")
          ? "video"
          : file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "")
            ? "pdf"
            : file && !file.type.startsWith("image/")
              ? "document"
              : "photo",
        flujo: standFlow ? "stand_recepcion" : "simple",
        category: standFlow ? "Stands" : null,
      });

      if (insErr) {
        console.error(insErr);
        toast.error("Error al guardar el beneficio");
        setSubmitting(false);
        return;
      }

      onCreated();

      if (keepOpen) {
        toast.success("✓ Beneficio agregado — continúa con el siguiente");
        resetItemFields();
        setSubmitting(false);
      } else {
        toast.success("✓ Beneficio creado correctamente");
        setSubmitting(false);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Error inesperado");
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isDirty() && !submitting) {
      setConfirmCancel(true);
      return;
    }
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar beneficio</DialogTitle>
            {lockedSponsor && (
              <DialogDescription>
                Para <span className="font-semibold text-foreground">{lockedSponsor}</span>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {/* Sponsor */}
            <FieldA label="Sponsor *" error={errors.sponsor}>
              {lockedSponsor ? (
                <Input value={lockedSponsor} disabled />
              ) : (
                <>
                  <Input
                    placeholder="Buscar o escribir sponsor…"
                    value={sponsorQuery}
                    onChange={(e) => { setSponsorQuery(e.target.value); setSponsor(e.target.value); }}
                    list="sponsor-list"
                  />
                  <datalist id="sponsor-list">
                    {filteredSponsors.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </>
              )}
            </FieldA>

            {/* Fase */}
            <FieldA label="Fase *" error={errors.fase}>
              <div className="flex gap-2">
                {FASES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFase(f)}
                    className={cn(
                      "flex-1 px-2 py-2 rounded-md border text-xs font-semibold",
                      fase === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input hover:bg-accent",
                    )}
                  >
                    {FASE_EMOJI[f]} {FASE_LABEL[f]}
                  </button>
                ))}
              </div>
            </FieldA>

            {/* Tipo */}
            <FieldA label="Tipo de beneficio *" error={errors.tipo}>
              <div className="space-y-2">
                <select
                  value={
                    tipoMode === "existing" ? `existing:${existingTipo}` :
                    tipoMode === "predef" ? `predef:${predefKey}` :
                    tipoMode === "custom" ? "custom" :
                    ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) { setTipoMode(""); return; }
                    if (v === "custom") { setTipoMode("custom"); return; }
                    if (v.startsWith("existing:")) {
                      setTipoMode("existing");
                      const t = v.slice("existing:".length);
                      setExistingTipo(t);
                      if (isStandTipo(t, "")) setRequiereActa(true);
                      return;
                    }
                    if (v.startsWith("predef:")) {
                      const key = v.slice("predef:".length);
                      setTipoMode("predef");
                      setPredefKey(key);
                      const p = PREDEF.find((x) => x.key === key);
                      if (p) setPredefN(p.defaultN || 1);
                      if (key.startsWith("stand_")) setRequiereActa(true);
                      return;
                    }
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Selecciona un tipo…</option>
                  {tipoOptions.length > 0 && (
                    <optgroup label="Tipos existentes">
                      {tipoOptions.map((t) => (
                        <option key={`e-${t}`} value={`existing:${t}`}>{t}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Tipos nuevos predefinidos">
                    {PREDEF.map((p) => (
                      <option key={p.key} value={`predef:${p.key}`}>{p.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Personalizado">
                    <option value="custom">+ Otro (personalizado)</option>
                  </optgroup>
                </select>

                {tipoMode === "predef" && currentPredef?.extra && (
                  <div>
                    <label className="text-[11px] text-muted-foreground">
                      {currentPredef.extra === "percent" ? "Porcentaje (1-100)" : "Cantidad"}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={currentPredef.extra === "percent" ? 100 : undefined}
                      value={predefN}
                      onChange={(e) => setPredefN(parseInt(e.target.value) || 0)}
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Vista previa: <span className="font-semibold text-foreground">{currentPredef.build(predefN || 1)}</span>
                    </div>
                  </div>
                )}

                {tipoMode === "custom" && (
                  <Input
                    placeholder="Nombre del beneficio…"
                    value={customTipo}
                    onChange={(e) => setCustomTipo(e.target.value)}
                  />
                )}
              </div>
            </FieldA>

            <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/20 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={requiereActa}
                onChange={(e) => setRequiereActa(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  Requiere acta de recepción de stand
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  El responsable pedirá foto + firma del sponsor + horarios de entrega.
                </span>
              </span>
            </label>

            {/* Responsable */}
            <FieldA label="Responsable *" error={errors.responsable}>
              {!useOwnerCustom ? (
                <select
                  value={responsable}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setUseOwnerCustom(true);
                      setResponsable("");
                    } else {
                      setResponsable(e.target.value);
                    }
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {ownerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  <option value="__custom__">+ Otro…</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre del responsable"
                    value={ownerCustom}
                    onChange={(e) => setOwnerCustom(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => { setUseOwnerCustom(false); setOwnerCustom(""); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </FieldA>

            <div className="grid grid-cols-2 gap-2">
              <FieldA label="Día">
                {!useDiaCustom ? (
                  <select
                    value={dia}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") { setUseDiaCustom(true); setDia(""); }
                      else setDia(e.target.value);
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">—</option>
                    {DIA_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="__custom__">+ Otro…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input value={diaCustom} onChange={(e) => setDiaCustom(e.target.value)} placeholder="Personalizado" />
                    <Button type="button" variant="outline" onClick={() => { setUseDiaCustom(false); setDiaCustom(""); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </FieldA>
              <FieldA label="Hora">
                <Input value={hora} onChange={(e) => setHora(e.target.value)} placeholder="14:30 / Por confirmar…" />
              </FieldA>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldA label="Stage">
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FieldA>
              <FieldA label="Speaker">
                <Input value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
              </FieldA>
            </div>

            <FieldA label="Notas">
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
            </FieldA>

            <FieldA label="Evidencia (opcional)" error={errors.file}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-foreground file:cursor-pointer"
              />
              {file && (
                <div className="mt-2 rounded-md border border-border p-2 flex items-center gap-3 bg-muted/30">
                  <FilePreview file={file} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{file.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "—"}
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Imágenes, videos o PDF. Máximo 50MB. Si subes evidencia, el estado será "Por revisar"; si no, será "Pendiente".
              </p>
            </FieldA>
          </div>

          <DialogFooter className="flex-row !justify-between gap-2 sm:!justify-between">
            <Button variant="outline" disabled={submitting} onClick={handleClose}>
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => doSave(true)}>
                Guardar y agregar otro
              </Button>
              <Button disabled={submitting} onClick={() => doSave(false)}>
                {submitting ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes campos sin guardar. Si cierras ahora, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmCancel(false); onClose(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const FilePreview = ({ file }: { file: File }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (file.type.startsWith("image/")) {
      const u = URL.createObjectURL(file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(null);
  }, [file]);

  if (file.type.startsWith("image/") && url) {
    return <img src={url} alt="preview" className="w-12 h-12 object-cover rounded" />;
  }
  if (file.type.startsWith("video/")) {
    return <FileVideo className="w-10 h-10 text-muted-foreground" />;
  }
  if (file.type === "application/pdf") {
    return <FileText className="w-10 h-10 text-muted-foreground" />;
  }
  return <FileImage className="w-10 h-10 text-muted-foreground" />;
};

const FieldA = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[11px] uppercase font-bold text-muted-foreground mb-1">{label}</div>
    {children}
    {error && <div className="text-[11px] text-destructive mt-1">{error}</div>}
  </div>
);
