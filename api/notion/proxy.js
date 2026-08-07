/**
 * Proxy Notion para producción (Vercel Serverless).
 * En local usa el middleware de Vite (`vite-plugin-notion-proxy.ts`).
 *
 * POST /api/notion/proxy
 * Headers: X-Notion-Token
 * Body: { path, method?, body? }
 */
const NOTION_VERSION = "2025-09-03";
const NOTION_BASE = "https://api.notion.com/v1";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Notion-Token"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const token = String(req.headers["x-notion-token"] || "").trim();
    if (!token) {
      return res.status(401).json({ error: "Falta X-Notion-Token" });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const apiPath = payload.path;
    const method = String(payload.method || "GET").toUpperCase();

    if (!apiPath || typeof apiPath !== "string" || !apiPath.startsWith("/")) {
      return res.status(400).json({ error: "path inválido" });
    }

    const upstream = await fetch(`${NOTION_BASE}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body:
        method === "GET" || method === "HEAD"
          ? undefined
          : JSON.stringify(payload.body ?? {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Proxy error",
    });
  }
}
