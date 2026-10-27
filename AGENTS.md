# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
EzzyERP — one Vite + React + TypeScript web app (multi-tenant retail POS / billing / inventory / accounting for Indian businesses), with thin Capacitor (Android) and Electron (Windows) wrappers; the web app is the primary surface. Package manager is **npm** (`package-lock.json`) and all `package.json` scripts call `npm run`. Never add a second lockfile — Vercel detects the package manager from whichever lockfile is present.

### Backend
- The sole backend is a **cloud-hosted Supabase project** (Postgres + Auth + RLS + Edge Functions), owned by Lovable. Credentials are committed in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); no local backend needs to be started.
- That URL is the **live production** instance used by real tenants: do NOT create test users, organizations, or sample data against it. `supabase/migrations/*` are copies kept for review; applying them (SQL editor / Lovable pipeline) is separate from the Vercel build.
- Edge function source lives in `supabase/functions/`. Merging to `main` and the Vercel build do **not** deploy Deno functions — run `supabase functions deploy <name>` (or the team's pipeline), otherwise production keeps serving the old bundle.

### Running / building (commands live in `package.json`)
- Dev server: `npm run dev` → Vite on **port 8080** (host `::`).
- `vite.config.ts` must keep `envDir` pinned and wrap the Supabase stack plugin in `guardEnvDir()`: the sandbox plugin host hands plugin `configResolved` hooks a config whose `envDir` is unset, so the plugin's `loadEnv("production", config.envDir, ...)` throws and the dev server dies on boot.
- Build: `npm run build` (prod) or `npm run build:dev`. Preview a build with `npm run preview`.
- Lint: `npm run lint`. Thousands of pre-existing eslint errors (mostly `@typescript-eslint/no-explicit-any`) are the repo baseline; judge by the delta on files you touched.

### Console / load performance
- Do **not** add `console.log` / `console.info` on POS, dashboard, or paginated-fetch hot paths — DevTools serializes them on the main thread and the app feels frozen. New probes must use `diagConsoleInfo` (`src/lib/diagConsole.ts`) behind a `localStorage` flag. Details: `docs/console-perf-protections.md`, `.cursor/rules/console-hot-paths.mdc`.
- CI: `npm run check:console-guard`. Do not enable Vite `drop_console` (hides real `console.error`).

### Boot resilience
- Boot dynamic imports in `src/main.tsx` must keep their `.catch(onBootImportFailed)`: a failed `import()` fires no script/link error event, so the inline boot guard in `index.html` cannot see it and the tab blanks (2026-10-27: `erpBootstrap-*.js`). Recovery lives in `index.html` (`__ezzyBootImportFailed`); keep `test/bootAssetGuard.test.ts` green.

### Testing (see `test/README.md`)

- `npm test` runs the full Vitest suite. Unit tests pass offline; the 9 integration/seed tests are **skipped** unless a separate **staging** Supabase is configured via `.env.test` (`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`) — never point test config at production.
- `npm run test:money` runs pure money-path logic (settlement, balance, drift) — fast, no DB.

### Auth / gotcha for end-to-end UI testing
- There is **no self-service signup**. Access requires an admin-provisioned account. Routes: `/auth` = Platform Admin login; `/:orgSlug` = organization login; `/organization-setup` = org entry / create-org (create-org requires an already-authenticated user).
- Because the backend is live production and no test credentials exist here, authenticated flows (creating a customer, ringing a sale) can't be exercised without real test credentials for a demo org or a provisioned staging backend. Loading `/:orgSlug` does prove connectivity: it fetches real org branding via the `get_org_public_info` RPC and sign-in performs a real auth round-trip.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

This project has a knowledge graph. Use it to narrow scope before scanning files, then read the source.

- **Use first**: `semantic_search_nodes_tool` / `query_graph_tool` (exploring; callers_of / callees_of / imports_of / tests_for), `get_impact_radius_tool` (blast radius), `detect_changes_tool` + `get_review_context_tool` (review), `get_affected_flows_tool` (impacted paths), `get_architecture_overview_tool` + `list_communities_tool` (architecture), `refactor_tool` (renames, dead code).
- **Verify in the source**: never change code from graph output alone; read the implementation and relevant tests for non-trivial changes, especially behavior, database logic, migrations, retries, fallbacks, recovery or compatibility code. Source wins over stale graph output, and an empty result can mean "not indexed", not "does not exist".
- The graph auto-updates on file changes via hooks.
<!-- /code-review-graph MCP tools -->
