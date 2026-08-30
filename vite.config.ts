import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { visualizer } from "rollup-plugin-visualizer";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
/** Bust React Query persisted cache on each build/deploy (see queryPersister.ts). */
const appBuildId =
  process.env.VITE_APP_BUILD_ID ??
  process.env.GITHUB_SHA?.slice(0, 12) ??
  `${pkg.version}-${Date.now()}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    process.env.ANALYZE === "1" &&
      (visualizer({
        filename: "/tmp/bundle-report.html",
        gzipSize: true,
        brotliSize: false,
        template: "treemap",
      }) as any),
    VitePWA({
      injectRegister: false,
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'robots.txt'],
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
        // Precache offline.html only — never index.html (stale HTML + hashed chunk 404).
        // NetworkOnly navigations fall back to this page instead of a white screen.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}', 'offline.html'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'offline.html',
        runtimeCaching: [
          {
            // Navigations must NEVER fall back to a cached HTML shell after deploy.
            // NetworkFirst + 8s timeout previously served yesterday's index.html on slow
            // shop Wi‑Fi → hashed chunks 404 as text/html → blank PWA until cache clear.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
            options: {
              cacheName: 'html-navigations',
            },
          },
          {
            // Don't cache Supabase auth requests - always go to network
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-auth',
            }
          },
          {
            // Don't cache Supabase REST API requests
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-api',
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            // StaleWhileRevalidate, NOT CacheFirst: the font CSS embeds versioned
            // gstatic hashes. Cached for a year, it kept requesting woff2 files
            // Google had already deleted -> permanent 404s.
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'EzzyERP - Easy Billing, Smart Business',
        short_name: 'EzzyERP',
        description: 'EzzyERP - Easy Billing, Smart Business for garment & retail businesses',
        theme_color: '#1e40af',
        background_color: '#1e40af',
        display: 'standalone',
        // "any" — portrait-only can block Chrome desktop install prompts on Windows.
        orientation: 'any',
        scope: '/',
        // Cold install without a remembered shop → org URL entry (not Platform Admin /auth).
        // When a shop slug is known, OrgLayout swaps in a dynamic manifest with start_url /{slug}.
        start_url: '/organization-setup',
        categories: ['business', 'finance', 'productivity'],
        // Lets Chrome report “already installed” via getInstalledRelatedApps / Open in app.
        related_applications: [
          { platform: 'webapp', url: '/manifest.webmanifest' },
        ],
        prefer_related_applications: false,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Deduplicate React to prevent hook issues on older Android WebViews
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  build: {
    // Target modern browsers while maintaining compatibility
    target: 'es2020',
    // Generate sourcemaps for debugging in development
    sourcemap: mode === 'development',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's __vitePreload helper is a virtual module. Rollup was folding it into
          // pdf-vendor, which forced the whole 353 KB gz PDF bundle onto the critical
          // path via the entry chunk. Keep it isolated.
          if (id.includes("vite/preload-helper")) return "vite-preload";
          if (!id.includes("node_modules")) return;

          if (id.includes("@tanstack/react-query")) return "query-vendor";
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("recharts") || id.includes("d3-")) return "chart-vendor";
          if (
            id.includes("jspdf") ||
            id.includes("html2canvas") ||
            id.includes("pdf-lib")
          ) {
            return "pdf-vendor";
          }
          if (id.includes("xlsx") || id.includes("sheetjs")) return "xlsx-vendor";
          if (id.includes("@radix-ui") || id.includes("lucide-react")) {
            return "ui-vendor";
          }
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-router")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
}));
