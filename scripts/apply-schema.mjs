/**
 * Aplica supabase/schema.sql usando DATABASE_URL (connection string de Postgres).
 *
 * Uso:
 *   DATABASE_URL="postgresql://postgres.[ref]:[PASSWORD]@aws-0-....pooler.supabase.com:6543/postgres" \
 *     node scripts/apply-schema.mjs
 *
 * La password está en: Supabase Dashboard → Project Settings → Database
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("Falta DATABASE_URL. Copia el connection string desde Supabase → Settings → Database.");
  process.exit(1);
}

const sql = readFileSync(resolve(__dirname, "../supabase/schema.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query(sql);
  console.log("✓ Schema aplicado correctamente");
} catch (e) {
  console.error("Error aplicando schema:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
