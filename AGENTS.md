# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

EzzyERP is a React + TypeScript + Vite SPA (PWA) for garment/retail ERP (billing, inventory, accounting, GST compliance). The backend is entirely **remote Supabase** (PostgreSQL + Auth + Edge Functions) — no local backend services are required.

### Running the application

- **Dev server:** `npm run dev` — starts Vite on port 8080 (host `::`)
- **Build:** `npm run build` — production build to `dist/`
- **Lint:** `npm run lint` — runs ESLint (flat config in `eslint.config.js`)
- **Preview:** `npm run preview` — serve production build locally

### Key notes

- The `.env` file at repo root contains Supabase anon keys and URL for the hosted backend. These are non-secret publishable keys.
- There is no local database, Docker, or docker-compose setup. All data flows through the remote Supabase instance.
- The 25 Supabase Edge Functions in `supabase/functions/` are Deno-based and deployed to Supabase Cloud — they do not run locally.
- ESLint will report many `@typescript-eslint/no-explicit-any` warnings; these are pre-existing and not blocking.
- The build produces large chunks (>500 kB); the warning is expected and non-blocking.
- Node.js 20 LTS is used. nvm is configured in `~/.nvm` for version management.
- `package-lock.json` is the lockfile — use `npm install` (not yarn/pnpm).
