# Customer bill page — Vercel project

The customer app (`src/customer`, built by `npm run build:customer`) is deployed as its
**own** Vercel project from this repo. This folder is that project's Root Directory, so
it uses `customer-app/vercel.json` instead of the ERP's root `vercel.json`.

## Vercel project settings

| Setting | Value |
|---|---|
| Root Directory | `customer-app` |
| Include files outside the Root Directory | On (default) |
| Framework preset | Other |
| Build / install / output | leave empty (taken from `customer-app/vercel.json`) |

Environment variables (Production + Preview):

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
  `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY` (Firebase console → Project settings).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` come from the committed `.env`.

## Domains

The shop is read from the first part of the host name, and must equal
`organizations.public_subdomain`: `demo.inventoryshop.in` → shop `demo`.

1. DNS at the domain provider: `CNAME demo → cname.vercel-dns.com`.
2. Vercel → this project → Domains → add `demo.inventoryshop.in`.
3. ERP project env: `VITE_CUSTOMER_PAGE_DOMAIN=inventoryshop.in` (enables bill links).

Add one CNAME + domain per shop, or a wildcard `*.inventoryshop.in` (needs Vercel DNS).
