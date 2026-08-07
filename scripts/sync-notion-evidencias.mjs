/**
 * Sincroniza archivos de la propiedad Notion "Evidencia" (Lab Beneficios)
 * hacia Supabase Storage + tasks.evidencia_url.
 *
 * Uso (desde la carpeta del proyecto):
 *   NOTION_TOKEN=ntn_... node scripts/sync-notion-evidencias.mjs
 *
 * Si no hay NOTION_TOKEN, intenta leer Dashboard Seguimiento/.notion/oauth.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const LAB_DB = "c46217e9-0d5e-4d9a-9d4f-8c50aff644c6";
const NOTION_VERSION = "2025-09-03";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function resolveNotionToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN.trim();
  const oauthPath =
    "/Users/juancamilogonzalezg/Colombia Tech Week/Dashboard Seguimiento/.notion/oauth.json";
  if (fs.existsSync(oauthPath)) {
    const j = JSON.parse(fs.readFileSync(oauthPath, "utf8"));
    if (j.access_token) return j.access_token;
  }
  throw new Error("No hay NOTION_TOKEN ni oauth.json");
}

async function notion(token, pathName, method = "GET", body) {
  const res = await fetch(`https://api.notion.com/v1${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Notion ${res.status}`);
  return data;
}

async function queryLabWithFiles(token) {
  const db = await notion(token, `/databases/${LAB_DB}`);
  const ds = db.data_sources?.[0]?.id;
  const pages = [];
  let cursor;
  do {
    const pathName = ds
      ? `/data_sources/${ds}/query`
      : `/databases/${LAB_DB}/query`;
    const res = await notion(token, pathName, "POST", {
      start_cursor: cursor,
      page_size: 100,
    });
    for (const row of res.results || []) {
      if (!row.properties) continue;
      const ev = row.properties["Evidencia"];
      const files = ev?.type === "files" ? ev.files || [] : [];
      if (files.length === 0) continue;
      pages.push({ id: row.id, files });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function pickFileUrl(file) {
  if (file.type === "file" && file.file?.url) {
    return { url: file.file.url, name: file.name || "evidencia", hosted: true };
  }
  if (file.type === "external" && file.external?.url) {
    return { url: file.external.url, name: file.name || "evidencia", hosted: false };
  }
  return null;
}

function extFromName(name, contentType) {
  const fromName = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (fromName && fromName.length <= 5) return fromName.replace(/[^a-z0-9]/g, "");
  if (contentType?.includes("jpeg")) return "jpg";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("pdf")) return "pdf";
  if (contentType?.includes("mp4")) return "mp4";
  if (contentType?.includes("webm")) return "webm";
  return "bin";
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Falta SUPABASE_URL/KEY");
  const token = resolveNotionToken();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log("Consultando Lab Beneficios (páginas con Evidencia)…");
  const pages = await queryLabWithFiles(token);
  console.log(`Encontradas ${pages.length} páginas con evidencia en Notion`);

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, event_id, notion_page_id, evidencia_url, marca, tipo_beneficio")
    .not("notion_page_id", "is", null)
    .is("deleted_at", null)
    .limit(3000);
  if (error) throw error;

  const byNotion = new Map();
  for (const t of tasks || []) {
    if (t.notion_page_id) byNotion.set(t.notion_page_id, t);
  }

  let synced = 0;
  let linked = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const page of pages) {
    const task = byNotion.get(page.id);
    if (!task) {
      missing++;
      continue;
    }
    if (task.evidencia_url) {
      skipped++;
      continue;
    }

    const first = pickFileUrl(page.files[0]);
    if (!first) {
      failed++;
      continue;
    }

    try {
      if (!first.hosted) {
        // Enlace externo (Drive, etc.): guardar URL y marcar por validar
        const { error: upErr } = await supabase
          .from("tasks")
          .update({
            evidencia_url: first.url,
            status: "por_validar",
            hora_subida: new Date().toISOString(),
            subido_por: "Notion (enlace)",
            media_type: /\.(mp4|webm|mov)(\?|$)/i.test(first.url) ? "video" : "photo",
          })
          .eq("id", task.id);
        if (upErr) throw upErr;
        linked++;
        console.log(`🔗 ${task.marca} — enlace externo`);
        continue;
      }

      const fileRes = await fetch(first.url);
      if (!fileRes.ok) throw new Error(`download ${fileRes.status}`);
      const buf = Buffer.from(await fileRes.arrayBuffer());
      const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
      const ext = extFromName(first.name, contentType);
      const storagePath = `${task.event_id}/${task.id}/notion_${Date.now()}.${ext}`;

      const { error: stErr } = await supabase.storage
        .from("evidencias")
        .upload(storagePath, buf, { contentType, upsert: false });
      if (stErr) throw stErr;

      const { data: pub } = supabase.storage.from("evidencias").getPublicUrl(storagePath);
      const { error: upErr } = await supabase
        .from("tasks")
        .update({
          evidencia_url: pub.publicUrl,
          status: "por_validar",
          hora_subida: new Date().toISOString(),
          subido_por: "Notion",
          media_type: contentType.startsWith("video") ? "video" : "photo",
        })
        .eq("id", task.id);
      if (upErr) throw upErr;
      synced++;
      console.log(`✅ ${task.marca} — ${first.name}`);
    } catch (e) {
      failed++;
      console.error(`❌ ${task.marca}:`, e.message || e);
    }
  }

  console.log("\nResumen:");
  console.log({ synced, linked, skipped, missing, failed, notionWithFiles: pages.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
