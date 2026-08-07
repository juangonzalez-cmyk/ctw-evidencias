/**
 * Materializa evidencias externas (Drive, etc.) en el bucket público de Supabase
 * para que el PDF/HTML las muestre sin permisos de terceros.
 *
 *   node scripts/materialize-evidencias.mjs
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function driveFileId(url) {
  const m =
    url.match(/\/file\/d\/([^/]+)/) ||
    url.match(/[?&]id=([^&]+)/) ||
    url.match(/\/d\/([^/]+)/);
  return m?.[1] || null;
}

function driveDownloadUrls(fileId) {
  return [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`,
  ];
}

async function fetchDrive(fileId) {
  for (const url of driveDownloadUrls(fileId)) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      // HTML = página de login/confirmación, no el archivo
      if (ct.includes("text/html")) {
        const text = await res.text();
        const confirm = text.match(/confirm=([0-9A-Za-z_]+)/);
        if (confirm) {
          const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirm[1]}`;
          const res2 = await fetch(confirmUrl, { redirect: "follow" });
          if (!res2.ok) continue;
          const ct2 = res2.headers.get("content-type") || "";
          if (ct2.includes("text/html")) continue;
          return {
            buf: Buffer.from(await res2.arrayBuffer()),
            contentType: ct2 || "application/octet-stream",
          };
        }
        continue;
      }
      return {
        buf: Buffer.from(await res.arrayBuffer()),
        contentType: ct || "application/octet-stream",
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchOgImage(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CTW-Evidencias/1.0; +https://colombiatechweek.com)",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
    if (!m?.[1]) return null;
    const imgRes = await fetch(m[1]);
    if (!imgRes.ok) return null;
    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    return { buf: Buffer.from(await imgRes.arrayBuffer()), contentType: ct };
  } catch {
    return null;
  }
}

function extFromCt(ct) {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "bin";
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Falta SUPABASE URL/KEY");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, event_id, marca, evidencia_url")
    .not("evidencia_url", "is", null)
    .is("deleted_at", null)
    .limit(3000);
  if (error) throw error;

  const external = (tasks || []).filter(
    (t) => t.evidencia_url && !t.evidencia_url.includes("supabase.co")
  );
  console.log(`A materializar: ${external.length} evidencias externas`);

  let ok = 0;
  let fail = 0;

  for (const task of external) {
    const url = task.evidencia_url;
    try {
      let file = null;

      if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
        const id = driveFileId(url);
        if (!id) throw new Error("sin file id de Drive");
        file = await fetchDrive(id);
        if (!file) throw new Error("Drive no descargable (privado o bloqueado)");
      } else if (/\.(png|jpe?g|webp|gif|pdf|mp4)(\?|$)/i.test(url)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        file = {
          buf: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get("content-type") || "application/octet-stream",
        };
      } else {
        // Artículo / página web → intentar og:image
        file = await fetchOgImage(url);
        if (!file) throw new Error("sin archivo descargable (solo link web)");
      }

      if (file.buf.length < 500) throw new Error("archivo demasiado pequeño");

      const ext = extFromCt(file.contentType);
      const storagePath = `${task.event_id}/${task.id}/materialized_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("evidencias")
        .upload(storagePath, file.buf, {
          contentType: file.contentType,
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("evidencias").getPublicUrl(storagePath);
      const { error: dbErr } = await supabase
        .from("tasks")
        .update({
          evidencia_url: pub.publicUrl,
          media_type: file.contentType.startsWith("video")
            ? "video"
            : file.contentType.includes("pdf")
              ? "photo"
              : "photo",
        })
        .eq("id", task.id);
      if (dbErr) throw dbErr;

      ok++;
      console.log(`✅ ${task.marca} (${(file.buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      fail++;
      console.error(`❌ ${task.marca}: ${e.message || e}`);
    }
  }

  console.log("\nResumen:", { ok, fail, total: external.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
