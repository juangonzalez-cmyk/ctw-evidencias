/**
 * Copia soportes de capturas de voluntarios → beneficios contractuales
 * del mismo sponsor y mismo tipo. NUNCA borra ni pisa evidencia existente.
 *
 *   node scripts/link-volunteer-evidence.mjs --dry-run
 *   node scripts/link-volunteer-evidence.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const require = createRequire(pathToFileURL(process.cwd() + "/package.json"));
const { createClient } = require("@supabase/supabase-js");

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const EVENT = "f16f297f-ba4e-459f-826d-3a7352c24ec5";

function fold(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
function unify(raw) {
  const k = (raw || "").trim().toLowerCase();
  const map = {
    akua: "Akua",
    "akua ops": "Akua",
    "akua ops llc": "Akua",
    ceiba: "CEIBA",
    "ceiba software house": "CEIBA",
    lavalentina: "La Valentina",
    "la valentina": "La Valentina",
    munolab: "Muno Lab",
    munolabs: "Muno Lab",
    "muno labs": "Muno Lab",
    "make-celonis": "Make - Celonis",
    make: "Make - Celonis",
    "universidad el rosario": "U. Rosario",
    "universidad del rosario": "U. Rosario",
    "visa/mono": "Visa Mono",
    "visa mono": "Visa Mono",
    envia: "Envía",
    "envía": "Envía",
  };
  return map[k] || (raw || "").trim();
}
function captureKind(tipo) {
  const t = fold(tipo);
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
function isVolunteer(tipo) {
  return !/^(contrato|adicional|upgrade|tailor\s*made|captura)\s*:/i.test((tipo || "").trim());
}
function hasEv(t) {
  return !!(t.evidencia_url || (Array.isArray(t.evidencias) && t.evidencias.length) || t.acta_recepcion_url);
}
function parseMarcas(notas) {
  const m = (notas || "").match(/Marcas en slide\/pieza[^:]*:\s*(.+)$/im);
  if (!m?.[1] || /^todos los sponsors/i.test(m[1].trim())) return [];
  return m[1]
    .split(/·|,|;/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
let tasks = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("tasks").select("*").eq("event_id", EVENT).range(from, from + 999);
  if (error) throw error;
  tasks = tasks.concat(data || []);
  if (!data || data.length < 1000) break;
}
const active = tasks.filter((t) => !t.deleted_at);

const copies = [];

function planCopy(target, source, reason) {
  if (!target || !source) return;
  if (target.id === source.id) return;
  if (hasEv(target)) return;
  if (!hasEv(source)) return;
  copies.push({
    targetId: target.id,
    sourceId: source.id,
    marca: target.marca,
    targetTipo: target.tipo_beneficio,
    sourceTipo: source.tipo_beneficio,
    targetResp: target.responsable,
    sourceResp: source.responsable,
    reason,
    evidencia_url: source.evidencia_url,
    evidencias: source.evidencias,
    media_type: source.media_type,
    subido_por: source.subido_por,
    hora_subida: source.hora_subida,
  });
}

const byKey = new Map();
for (const t of active) {
  if (/ctf operaciones/i.test(t.marca)) continue;
  const kind = captureKind(t.tipo_beneficio);
  if (!kind) continue;
  const key = `${unify(t.marca)}::${kind}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(t);
}

for (const list of byKey.values()) {
  const sources = list.filter((t) => hasEv(t));
  const targets = list.filter((t) => !hasEv(t) && !isVolunteer(t.tipo_beneficio));
  if (!sources.length || !targets.length) continue;
  const preferred =
    sources.find((t) => isVolunteer(t.tipo_beneficio) && hasEv(t)) || sources[0];
  for (const target of targets) planCopy(target, preferred, "mismo sponsor + mismo tipo de captura");
}

// Foto genérica CTF Operaciones → contractuales vacíos de las marcas listadas en notas
for (const op of active.filter((t) => /ctf operaciones/i.test(t.marca) && hasEv(t))) {
  const kind = captureKind(op.tipo_beneficio);
  if (!kind) continue;
  const marcas = parseMarcas(op.notas);
  for (const brand of marcas) {
    const key = `${unify(brand)}::${kind}`;
    const list = byKey.get(key) || [];
    const targets = list.filter((t) => !hasEv(t) && !isVolunteer(t.tipo_beneficio));
    for (const target of targets) planCopy(target, op, "foto compartida CTF Operaciones (notas)");
  }
}

const uniq = [];
const seen = new Set();
for (const c of copies) {
  if (seen.has(c.targetId)) continue;
  seen.add(c.targetId);
  uniq.push(c);
}

console.log(`Plan: ${uniq.length} beneficios contractuales vacíos recibirían copia de soporte (origen intacto).`);
for (const c of uniq) {
  console.log(
    `- ${c.marca} | ${c.targetTipo.slice(0, 60)} ← ${c.sourceTipo.slice(0, 40)} (${c.sourceResp}) [${c.reason}]`
  );
}

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`backups/link_volunteer_plan_${stamp}.json`, JSON.stringify({ apply: APPLY, uniq }, null, 2));

if (!APPLY) {
  console.log("\nDry-run. Para aplicar: node scripts/link-volunteer-evidence.mjs --apply");
  process.exit(0);
}

let ok = 0;
for (const c of uniq) {
  const target = active.find((t) => t.id === c.targetId);
  const note = `${target?.notas ? target.notas + "\n\n" : ""}[Soporte vinculado ${new Date().toISOString().slice(0, 10)}] Copia de captura ${c.sourceId} (${c.sourceResp} · ${c.sourceTipo}). El archivo original no se movió ni se borró.`;
  const { error } = await sb
    .from("tasks")
    .update({
      evidencia_url: c.evidencia_url,
      evidencias: c.evidencias && Array.isArray(c.evidencias) && c.evidencias.length ? c.evidencias : undefined,
      media_type: c.media_type || "photo",
      subido_por: c.subido_por,
      hora_subida: c.hora_subida,
      status: target?.status === "aprobada" ? "aprobada" : "por_validar",
      notas: note,
      edited_at: new Date().toISOString(),
    })
    .eq("id", c.targetId)
    .is("evidencia_url", null);
  if (error) {
    console.error("FAIL", c.targetId, error.message);
  } else ok++;
}
console.log(`Aplicado: ${ok}/${uniq.length}. Filas de voluntarios intactas.`);
