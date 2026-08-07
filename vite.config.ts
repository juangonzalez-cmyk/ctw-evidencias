import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { notionProxyPlugin } from "./vite-plugin-notion-proxy";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("dompurify")) {
            return "pdf";
          }
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) {
            return "ui";
          }
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("scheduler")
          ) {
            return "react";
          }
          if (id.includes("@tanstack")) return "query";
        },
      },
    },
  },
  plugins: [
    react(),
    notionProxyPlugin(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "apple-touch-icon-120.png",
        "apple-touch-icon-152.png",
        "apple-touch-icon-167.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-192-maskable.png",
        "pwa-512-maskable.png",
        "isotipo_negro.png",
        "isotipo_blanco.png",
        "robots.txt",
      ],
      manifest: {
        name: "CTW Evidencias",
        short_name: "Evidencias",
        description:
          "Captura y entrega de evidencias de sponsors — Colombia Tech Week",
        theme_color: "#96e631",
        background_color: "#96e631",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        lang: "es-CO",
        categories: ["business", "productivity"],
        icons: [
          {
            src: "/pwa-192.png?v=4",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png?v=4",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-192-maskable.png?v=4",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/pwa-512-maskable.png?v=4",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Keep precache lean — heavy PDF libs load on demand
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        globIgnores: [
          "**/pdf-*.js",
          "**/jspdf*",
          "**/html2canvas*",
          "**/purify*",
          "**/index.es-*.js",
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.includes("supabase.co"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 48, maxAgeSeconds: 60 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
}));
