import { supabase } from "@/integrations/supabase/client";
import { unifyBrand } from "@/lib/brands";
import {
  FLUJO_STAND_RECEPCION,
  bogotaLocalToIso,
  isStandRecepcion,
  resolveStandStatusAfterEdit,
} from "@/lib/standRecepcion";
import {
  PULPO_STAND_ENTREGAS,
  type PulpoStandEntrega,
} from "@/data/pulpoStandCronograma";

export type StandTaskRow = {
  id: string;
  marca: string;
  tipo_beneficio: string;
  category: string | null;
  flujo: string | null;
  evidencia_url: string | null;
  acta_recepcion_url: string | null;
  entrega_ctw_at: string | null;
  entrega_sponsor_at: string | null;
  deleted_at: string | null;
  status?: string | null;
};

export type PulpoMatchStatus = "matched" | "ambiguous" | "missing";

export type PulpoMatchRow = {
  entrega: PulpoStandEntrega;
  status: PulpoMatchStatus;
  task: StandTaskRow | null;
  candidates: StandTaskRow[];
  /** Marca canónica hallada en el evento (aunque aún no tenga stand). */
  brandHint: string | null;
  iso: string;
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s: string): string {
  return norm(s).replace(/\s+/g, "");
}

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length > 1 && !["y", "and", "de", "la", "el", "del"].includes(t));
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const tmp = row[j + 1];
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1] + 1, row[j] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function namesForEntrega(e: PulpoStandEntrega): string[] {
  return [e.marca, ...(e.aliases ?? [])];
}

/** Score 0–100. Umbral de match ≥ 70. */
export function scoreBrandMatch(taskMarca: string, entrega: PulpoStandEntrega): number {
  const t = norm(taskMarca);
  const tc = compact(taskMarca);
  const tu = norm(unifyBrand(taskMarca));
  const tTokens = tokens(taskMarca);
  let best = 0;

  for (const name of namesForEntrega(entrega)) {
    const n = norm(name);
    const nc = compact(name);
    const nu = norm(unifyBrand(name));
    if (!n) continue;

    if (t === n || tu === n || t === nu || tu === nu || tc === nc) {
      best = Math.max(best, 100);
      continue;
    }

    // Prefijo / contención (Cineco ⊂ Cinecolombia, Getnexor ⊃ Nexor)
    // Evita falsos positivos cortos (COLO ⊂ Cineco, Due ⊂ …)
    const shorter = t.length <= n.length ? t : n;
    const longer = t.length <= n.length ? n : t;
    const shorterC = tc.length <= nc.length ? tc : nc;
    const longerC = tc.length <= nc.length ? nc : tc;
    if (longer.includes(shorter) || longerC.includes(shorterC)) {
      if (
        shorter.length >= 5 ||
        longer.startsWith(shorter) ||
        longerC.startsWith(shorterC)
      ) {
        best = Math.max(best, 85);
      }
      continue;
    }

    const nTokens = tokens(name);
    if (
      nTokens.length &&
      nTokens.every((nt) => tTokens.some((tt) => tt === nt || tt.includes(nt) || nt.includes(tt)))
    ) {
      best = Math.max(best, 80);
    }

    // Fuzzy 1–2 letras (Indrave ↔ Indriver)
    if (tc.length >= 5 && nc.length >= 5) {
      const dist = editDistance(tc, nc);
      const maxLen = Math.max(tc.length, nc.length);
      if (dist <= 2 && dist / maxLen <= 0.25) best = Math.max(best, 90);
    }
  }

  return best;
}

function findBrandHint(allTasks: StandTaskRow[], entrega: PulpoStandEntrega): string | null {
  const scored = allTasks
    .map((task) => ({ task, score: scoreBrandMatch(task.marca, entrega) }))
    .filter((x) => x.score >= 70)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.task.marca ?? null;
}

export function matchPulpoCronograma(tasks: StandTaskRow[]): PulpoMatchRow[] {
  const active = tasks.filter((t) => !t.deleted_at);
  const stands = active.filter((t) =>
    isStandRecepcion({
      flujo: t.flujo,
      tipo_beneficio: t.tipo_beneficio,
      category: t.category,
    })
  );

  return PULPO_STAND_ENTREGAS.map((entrega) => {
    const iso = bogotaLocalToIso(entrega.fecha, entrega.hora);
    const brandHint = findBrandHint(active, entrega);
    const scored = stands
      .map((task) => ({ task, score: scoreBrandMatch(task.marca, entrega) }))
      .filter((x) => x.score >= 70)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        entrega,
        status: "missing" as const,
        task: null,
        candidates: [],
        brandHint,
        iso,
      };
    }

    const top = scored[0].score;
    const topOnes = scored.filter((s) => s.score === top).map((s) => s.task);

    // Varios stands de la misma marca exacta: tomar el primero
    if (topOnes.length > 1) {
      const sameBrand = topOnes.every(
        (t) => norm(t.marca) === norm(topOnes[0].marca)
      );
      if (sameBrand) {
        return {
          entrega,
          status: "matched" as const,
          task: topOnes[0],
          candidates: topOnes,
          brandHint: topOnes[0].marca,
          iso,
        };
      }
      if (top < 100) {
        return {
          entrega,
          status: "ambiguous" as const,
          task: null,
          candidates: topOnes,
          brandHint,
          iso,
        };
      }
    }

    return {
      entrega,
      status: "matched" as const,
      task: topOnes[0],
      candidates: topOnes,
      brandHint: topOnes[0].marca,
      iso,
    };
  });
}

export type ApplyPulpoResult = {
  updated: number;
  created: number;
  skipped: number;
  unmatched: string[];
  ambiguous: string[];
};

function tipoFromTamaño(tamaño: string): string {
  const m = tamaño.match(/(\d+\s*[x×]\s*\d+)/i);
  if (m) return `Stand ${m[1].replace(/\s/g, "").replace("×", "x")}`;
  if (/espacio\s*limpio/i.test(tamaño)) return "Stand — Espacio limpio";
  return `Stand ${tamaño}`;
}

/**
 * Aplica el cronograma Pulpo→CTW.
 * - Actualiza `entrega_ctw_at` en stands matcheados (no toca entrega_sponsor_at).
 * - Opcionalmente crea beneficios stand faltantes (usa marca canónica del evento si existe).
 * - Si `selectedKeys` está definido, solo aplica esas filas (clave: marca|fecha|hora).
 */
export function pulpoMatchKey(entrega: Pick<PulpoStandEntrega, "marca" | "fecha" | "hora">): string {
  return `${entrega.marca}|${entrega.fecha}|${entrega.hora}`;
}

export async function applyPulpoCronograma(opts: {
  eventId: string;
  createMissing: boolean;
  defaultResponsable: string;
  /** Si se pasa, solo se aplican esas entregas. */
  selectedKeys?: string[] | null;
}): Promise<ApplyPulpoResult> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, marca, tipo_beneficio, category, flujo, evidencia_url, acta_recepcion_url, entrega_ctw_at, entrega_sponsor_at, deleted_at, status"
    )
    .eq("event_id", opts.eventId)
    .is("deleted_at", null);

  if (error) throw error;

  const matches = matchPulpoCronograma((data ?? []) as StandTaskRow[]);
  const selected =
    opts.selectedKeys == null
      ? null
      : new Set(opts.selectedKeys.map((k) => k.trim()).filter(Boolean));

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const unmatched: string[] = [];
  const ambiguous: string[] = [];

  for (const row of matches) {
    const key = pulpoMatchKey(row.entrega);
    if (selected && !selected.has(key)) {
      skipped++;
      continue;
    }

    if (row.status === "ambiguous") {
      ambiguous.push(
        `${row.entrega.marca} → ${row.candidates.map((c) => c.marca).join(" | ")}`
      );
      skipped++;
      continue;
    }

    if (row.status === "missing") {
      if (!opts.createMissing) {
        unmatched.push(
          row.brandHint
            ? `${row.entrega.marca} (marca en evento: ${row.brandHint}, sin stand)`
            : row.entrega.marca
        );
        skipped++;
        continue;
      }

      const marca = row.brandHint || row.entrega.marca;
      const tipo = tipoFromTamaño(row.entrega.tamaño);
      const notasParts = [
        row.entrega.standNo ? `Stand #${row.entrega.standNo}` : null,
        `Tamaño: ${row.entrega.tamaño}`,
        row.entrega.quienEntrega ? `Entrega Pulpo: ${row.entrega.quienEntrega}` : null,
        row.entrega.observacion || null,
        "Horario Pulpo→CTW cargado desde cronograma",
      ].filter(Boolean);

      const { data: inserted, error: insErr } = await supabase
        .from("tasks")
        .insert({
          event_id: opts.eventId,
          marca,
          tipo_beneficio: tipo,
          category: "Stands",
          flujo: FLUJO_STAND_RECEPCION,
          responsable: opts.defaultResponsable,
          status: "pendiente",
          media_type: "photo",
          is_timed: false,
          entrega_ctw_at: row.iso,
          notas: notasParts.join(" · "),
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      if (inserted) created++;
      continue;
    }

    const task = row.task!;
    const resolved = resolveStandStatusAfterEdit(task.status, {
      evidencia_url: task.evidencia_url,
      acta_recepcion_url: task.acta_recepcion_url,
      entrega_ctw_at: row.iso,
      entrega_sponsor_at: task.entrega_sponsor_at,
    });

    const { error: upErr } = await supabase
      .from("tasks")
      .update({
        entrega_ctw_at: row.iso,
        flujo: FLUJO_STAND_RECEPCION,
        category: task.category?.trim() ? task.category : "Stands",
        status: resolved.status,
        ...(resolved.clearApproved ? { approved_at: null } : {}),
        edited_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (upErr) throw upErr;
    updated++;
  }

  return { updated, created, skipped, unmatched, ambiguous };
}

export function previewPulpoCronograma(tasks: StandTaskRow[]) {
  const matches = matchPulpoCronograma(tasks);
  return {
    total: matches.length,
    matched: matches.filter((m) => m.status === "matched").length,
    missing: matches.filter((m) => m.status === "missing").length,
    ambiguous: matches.filter((m) => m.status === "ambiguous").length,
    rows: matches,
  };
}

/**
 * Hora Pulpo→CTW efectiva para un stand:
 * 1) la guardada en DB, o
 * 2) la del cronograma Excel si la marca matchea (≥70).
 */
export function resolveEntregaCtwIso(task: {
  marca: string;
  entrega_ctw_at?: string | null;
}): string | null {
  if (task.entrega_ctw_at) return task.entrega_ctw_at;

  let best: PulpoStandEntrega | null = null;
  let bestScore = 0;
  for (const entrega of PULPO_STAND_ENTREGAS) {
    const score = scoreBrandMatch(task.marca, entrega);
    if (score > bestScore) {
      bestScore = score;
      best = entrega;
    }
  }
  if (!best || bestScore < 70) return null;
  return bogotaLocalToIso(best.fecha, best.hora);
}
