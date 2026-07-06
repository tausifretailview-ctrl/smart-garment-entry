# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
EzzyERP — a single Vite + React + TypeScript web app (multi-tenant retail POS / billing / inventory / accounting for Indian businesses). It also has thin Capacitor (Android) and Electron (Windows) wrappers, but the web app is the primary surface. Package manager is **npm** (`package-lock.json`); a `bun.lock` also exists but npm is canonical (all `package.json` scripts call `npm run`).

### Backend
- The sole backend is a **cloud-hosted Supabase project** (Postgres + Auth + RLS + Edge Functions), owned by Lovable. Credentials are already committed in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). No local database/backend needs to be started to run or develop the frontend.
- The Supabase URL in `.env` points at the **live production** instance used by real tenants. Treat it as production: do NOT create test users, organizations, or sample data against it. `supabase/migrations/*` and Edge Function source are NOT in this checkout — they live in the managed cloud project, so a local Supabase cannot be reproduced from this repo.

### Running / building (commands live in `package.json`)
- Dev server: `npm run dev` → Vite on **port 8080** (host `::`). This is the main way to run the app.
- Build: `npm run build` (prod) or `npm run build:dev`. Preview a build with `npm run preview`.
- Lint: `npm run lint`. NOTE: the existing codebase currently reports thousands of pre-existing eslint errors (mostly `@typescript-eslint/no-explicit-any`); a non-zero lint exit is the repo baseline, not something your change necessarily introduced. Judge lint by the delta on files you touched.

### Testing (see `test/README.md` for full detail)
- `npm test` runs the full Vitest suite. Unit tests need no credentials and pass offline; the 9 integration/seed tests are **skipped** unless a separate staging Supabase is configured via `.env.test` (`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`). Never point test config at production.
- `npm run test:money` runs the pure money-path logic tests (settlement, balance, drift) — fast, no DB.

### Auth / gotcha for end-to-end UI testing
- There is **no self-service signup** in the UI. Access requires an admin-provisioned account against the live Supabase project. Routes: `/auth` = Platform Admin login; `/:orgSlug` (e.g. `/demo`) = organization login; `/organization-setup` = org entry / create-org (create-org requires an already-authenticated user).
- Because the backend is live production and there are no test credentials in the environment, an authenticated core-functionality flow (creating a customer, ringing a sale, etc.) cannot be exercised here without either real test credentials for a non-production/demo org or a provisioned staging backend. Loading `/:orgSlug` does prove backend connectivity: the login page fetches real org branding via the `get_org_public_info` RPC and the sign-in button performs a real Supabase auth round-trip.
