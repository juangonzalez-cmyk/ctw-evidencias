/**
 * Import headless de GovTech desde Notion → Supabase.
 * Replica exactamente "Crear e importar" del EventCreateWizard (fuente govtech).
 *
 * Uso:
 *   npx vite-node scripts/import-notion-govtech.ts -- --dry-run
 *   npx vite-node scripts/import-notion-govtech.ts
 *
 * Guardas (abortan antes de escribir):
 *   - preview != EXPECTED_TASKS tareas o != EXPECTED_BRANDS marcas distintas
 *   - ya existe un evento con el slug (no duplica)
 * Solo hace INSERTs, todos dentro del evento nuevo.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { benefitsToTasks, previewNotionImport } from "../src/lib/notionImport";

const EVENT = {
  name: "GovTech Summit 2026",
  short_name: "GovTech 2026",
  slug: "govtech-summit-2026",
  description: null as string | null,
  starts_on: "2026-11-03",
  ends_on: "2026-11-04",
  status: "active",
};
const EXPECTED_TASKS = Number(process.env.EXPECTED_TASKS || 333);
const EXPECTED_BRANDS = Number(process.env.EXPECTED_BRANDS || 30);
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

function slugify(v: string) {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// previewNotionImport llama a /api/notion/proxy (proxy de Vite). En Node lo resolvemos directo.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  if (url === "/api/notion/proxy") {
    const p = JSON.parse(String(init?.body || "{}"));
    const token = (init?.headers as Record<string, string>)["X-Notion-Token"];
    const method = String(p.method || "GET").toUpperCase();
    return realFetch(`https://api.notion.com/v1${p.path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(p.body ?? {}),
    });
  }
  return realFetch(url, init);
}) as typeof fetch;

function fail(msg: string): never {
  console.error(`ABORT: ${msg}`);
  process.exit(1);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const notionToken = process.env.NOTION_TOKEN?.trim();
  if (!url || !key) fail("Falta SUPABASE_URL / SUPABASE_SECRET_KEY");
  if (!notionToken) fail("Falta NOTION_TOKEN");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // --- Preview (solo lectura) ---
  const preview = await previewNotionImport(notionToken, { source: "govtech", eventFilter: null });
  const brands = new Set(preview.benefits.map((b) => b.sponsorName));
  console.log(
    `Preview Notion: ${preview.sponsors.length} sponsors CRM · ${preview.benefits.length} beneficios · ${brands.size} marcas`
  );
  if (preview.benefits.length !== EXPECTED_TASKS)
    fail(`preview tiene ${preview.benefits.length} tareas, se esperaban ${EXPECTED_TASKS}`);
  if (brands.size !== EXPECTED_BRANDS)
    fail(`preview tiene ${brands.size} marcas, se esperaban ${EXPECTED_BRANDS}`);

  // --- Idempotencia ---
  const { data: existing, error: exErr } = await sb.from("events").select("id").eq("slug", EVENT.slug);
  if (exErr) fail(exErr.message);
  if (existing && existing.length) fail(`ya existe un evento con slug ${EVENT.slug} (${existing[0].id})`);

  const owners = Array.from(
    new Set(preview.benefits.map((b) => b.owner).filter((o) => o && o !== "Sin asignar"))
  );
  const fases = benefitsToTasks("DRY", preview.benefits).reduce<Record<string, number>>((a, t) => {
    a[t.fase] = (a[t.fase] || 0) + 1;
    return a;
  }, {});
  console.log("Perfiles de campo:", owners, "· Fases:", fases);
  if (DRY_RUN) {
    console.log("DRY RUN: no se escribió nada.");
    return;
  }

  // --- Evento ---
  const { data: event, error: evErr } = await sb.from("events").insert(EVENT).select().single();
  if (evErr || !event) fail(evErr?.message || "No se pudo crear el evento");
  console.log(`Evento creado: ${event.id} (${event.slug})`);

  // --- Perfiles (igual que el wizard) ---
  const { error: coordErr } = await sb.from("profiles").insert({
    event_id: event.id,
    slug: "coordinadora",
    name: "Coordinadora CS",
    role: "Control de evidencias",
    emoji: "🎛️",
    accent: "from-[#96e631] to-[#009542]",
    is_coordinator: true,
    sort_order: 0,
  });
  if (coordErr) fail(`perfil coordinadora: ${coordErr.message}`);
  if (owners.length) {
    const { error: pErr } = await sb.from("profiles").insert(
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
    if (pErr) fail(`perfiles campo: ${pErr.message}`);
  }

  // --- Tareas en chunks de 200 ---
  const tasks = benefitsToTasks(event.id, preview.benefits);
  let inserted = 0;
  for (let i = 0; i < tasks.length; i += 200) {
    const chunk = tasks.slice(i, i + 200);
    const { error: tErr } = await sb.from("tasks").insert(chunk);
    if (tErr) fail(`import de tareas falló tras ${inserted}: ${tErr.message}`);
    inserted += chunk.length;
  }
  console.log(`Tareas insertadas: ${inserted}`);

  // --- Encuesta ---
  const { data: tpl, error: tplErr } = await sb
    .from("survey_templates")
    .insert({
      event_id: event.id,
      title: `Encuesta de satisfacción — ${event.short_name || event.name}`,
      description: "Antes de ver el informe de evidencias, cuéntanos tu experiencia como sponsor.",
    })
    .select("id")
    .single();
  if (tplErr || !tpl) fail(`survey_template: ${tplErr?.message}`);
  await insertQuestions(sb, tpl.id, event.short_name || event.name);
  console.log("Encuesta creada (1 plantilla + 4 preguntas). Listo.");
}

// Nota: en un insert masivo supabase-js/PostgREST manda null en las columnas que falten
// en alguna fila, así que `required` va explícito en todas (si no, viola NOT NULL).
async function insertQuestions(sb: ReturnType<typeof createClient>, templateId: string, label: string) {
  const tpl = { id: templateId };
  const event = { short_name: label, name: label };
  const { error: qErr } = await sb.from("survey_questions").insert([
    { template_id: tpl.id, prompt: "¿Qué tan satisfecho estás con la entrega de beneficios?", question_type: "scale_10", required: true, sort_order: 0 },
    { template_id: tpl.id, prompt: "¿La comunicación con el equipo CS fue clara y oportuna?", question_type: "scale_10", required: true, sort_order: 1 },
    { template_id: tpl.id, prompt: `¿Recomendarías patrocinar ${event.short_name || event.name} de nuevo?`, question_type: "yes_no", required: true, sort_order: 2 },
    { template_id: tpl.id, prompt: "Comentarios o sugerencias", question_type: "text", required: false, sort_order: 3 },
  ]);
  if (qErr) fail(`survey_questions: ${qErr.message}`);
}

/** Completa solo las preguntas si la plantilla del evento quedó sin ninguna. */
async function resumeSurvey() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("Falta SUPABASE_URL / SUPABASE_SECRET_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: ev } = await sb.from("events").select("id, name, short_name").eq("slug", EVENT.slug).maybeSingle();
  if (!ev) fail(`no existe ${EVENT.slug}`);
  const { data: tpl } = await sb.from("survey_templates").select("id").eq("event_id", ev.id).maybeSingle();
  if (!tpl) fail("el evento no tiene survey_template");
  const { count } = await sb.from("survey_questions").select("*", { count: "exact", head: true }).eq("template_id", tpl.id);
  if (count) fail(`la plantilla ya tiene ${count} preguntas; no se duplica`);
  if (DRY_RUN) { console.log("DRY RUN: insertaría 4 preguntas en", tpl.id); return; }
  await insertQuestions(sb, tpl.id, ev.short_name || ev.name);
  console.log("4 preguntas insertadas en", tpl.id);
}

(process.argv.includes("--resume-survey") ? resumeSurvey() : main()).catch((e) => fail(e instanceof Error ? e.message : String(e)));
