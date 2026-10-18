# Ezzy WhatsApp site — Vercel project

The WhatsApp-only site (`src/whatsapp-app`, built by `npm run build:whatsapp`) is for shops that
use only Bulk WhatsApp, not the ERP. It is deployed as its **own** Vercel project from this repo;
this folder is that project's Root Directory, so it uses `whatsapp-app/vercel.json`.

It shares the ERP's Supabase project (logins, `bulk_whatsapp_*` tables, `bulk-whatsapp` function)
but ships none of the ERP's code, so a deploy here never touches billing.

## Vercel project settings

| Setting | Value |
|---|---|
| Root Directory | `whatsapp-app` |
| Include files outside the Root Directory | On (default) |
| Framework preset | Other |
| Build / install / output | leave empty (taken from `whatsapp-app/vercel.json`) |

`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` come from the committed `.env`.

In the **ERP** project, set `VITE_WHATSAPP_SITE_URL` to this site's address so WhatsApp-only users
who open the ERP get an "Open WhatsApp site" button.

## Accounts

Platform Admin → Create organization → type **WhatsApp only** → add the shop's user with an
email and password. They sign in on this site. Suspending the organization stops new links and sends.

## WhatsApp server

Bulk sends use the `bulk-whatsapp` function's `WA_BULK_GATEWAY_URL` / `WA_BULK_GATEWAY_KEY`
(a second Railway service running `wa-gateway`) when set, else the shop-bill server.
