import { unifyBrand } from "@/lib/brands";
import { listEvidencias } from "@/lib/evidencias";
import type { Task } from "@/hooks/useTasks";

export type CaptureKind =
  | "totem"
  | "escarapela"
  | "camiseta"
  | "backing_foto"
  | "backing_principal"
  | "loop_raiz_ppal"
  | "loop_origen_ppal"
  | "loop_raiz_sec"
  | "loop_origen_sec"
  | "pantalla_lat_origen"
  | "portico";

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function captureKind(tipo: string | null | undefined): CaptureKind | null {
  const t = fold(tipo || "");
  if (!t) return null;
  if (/totem/.test(t)) return "totem";
  if (/escarapel/.test(t)) return "escarapela";
  if (/camiseta/.test(t)) return "camiseta";
  if (/portico|arco de bienvenida/.test(t)) return "portico";
  if (/backing fotograf/.test(t)) return "backing_foto";
  if (/backing principal/.test(t)) return "backing_principal";
  if (/pantalla lateral/.test(t) && /origen/.test(t)) return "pantalla_lat_origen";
  if (/loop/.test(t) && /raiz/.test(t) && /secund/.test(t)) return "loop_raiz_sec";
  if (/loop/.test(t) && /origen/.test(t) && /secund/.test(t)) return "loop_origen_sec";
  if (/loop/.test(t) && /raiz/.test(t)) return "loop_raiz_ppal";
  if (/loop/.test(t) && /origen/.test(t)) return "loop_origen_ppal";
  return null;
}

export function isVolunteerCaptureTipo(tipo: string | null | undefined): boolean {
  return !/^(contrato|adicional|upgrade|tailor\s*made|captura)\s*:/i.test((tipo || "").trim());
}

export function taskHasEvidence(task: {
  evidencia_url?: string | null;
  evidencias?: unknown;
  acta_recepcion_url?: string | null;
}): boolean {
  return (
    listEvidencias(task).length > 0 || !!(task.acta_recepcion_url && task.acta_recepcion_url.trim())
  );
}

/**
 * En vista KAM/informe: si hay captura de voluntario y beneficio de contrato
 * del mismo tipo, se muestra el contractual (con el soporte) y no se duplica.
 * No borra filas; solo filtra la lista en pantalla.
 */
export function preferCanonicalTasks<T extends Task>(tasks: T[]): T[] {
  const groups = new Map<string, T[]>();
  const passthrough: T[] = [];
  for (const t of tasks) {
    const kind = captureKind(t.tipo_beneficio);
    if (!kind) {
      passthrough.push(t);
      continue;
    }
    const key = `${unifyBrand(t.marca)}::${kind}`;
    const list = groups.get(key) || [];
    list.push(t);
    groups.set(key, list);
  }
  const out: T[] = [...passthrough];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]!);
      continue;
    }
    const contractual = list.filter((t) => !isVolunteerCaptureTipo(t.tipo_beneficio));
    const volunteer = list.filter((t) => isVolunteerCaptureTipo(t.tipo_beneficio));
    if (contractual.length) {
      out.push(...contractual);
      const contractHasEv = contractual.some(taskHasEvidence);
      if (!contractHasEv) {
        for (const v of volunteer) if (taskHasEvidence(v)) out.push(v);
      }
    } else {
      out.push(...volunteer);
    }
  }
  return out;
}

export function parseMarcasFromNotas(notas: string | null | undefined): string[] {
  const text = notas || "";
  const m = text.match(/Marcas en slide\/pieza[^:]*:\s*(.+)$/im);
  if (!m?.[1]) return [];
  return m[1]
    .split(/·|,|;/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && !/^todos los sponsors/i.test(s));
}
