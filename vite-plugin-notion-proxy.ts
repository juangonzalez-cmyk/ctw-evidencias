import type { Plugin } from "vite";

const NOTION_VERSION = "2025-09-03";
const NOTION_BASE = "https://api.notion.com/v1";

async function readBody(req: import("http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Proxy local a Notion API (evita CORS). Solo en `vite dev`.
 * POST /api/notion/proxy  { path, method?, body? } + header X-Notion-Token
 */
export function notionProxyPlugin(): Plugin {
  return {
    name: "notion-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/notion/proxy")) return next();
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "POST only" }));
          return;
        }

        try {
          const raw = await readBody(req);
          const payload = JSON.parse(raw || "{}") as {
            path?: string;
            method?: string;
            body?: unknown;
          };
          const token =
            (req.headers["x-notion-token"] as string | undefined)?.trim() ||
            "";
          if (!token) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Falta X-Notion-Token" }));
            return;
          }
          if (!payload.path || !payload.path.startsWith("/")) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "path inválido" }));
            return;
          }

          const method = (payload.method || "GET").toUpperCase();
          const upstream = await fetch(`${NOTION_BASE}${payload.path}`, {
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
          res.statusCode = upstream.status;
          res.setHeader("Content-Type", "application/json");
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : "Proxy error",
            })
          );
        }
      });
    },
  };
}
