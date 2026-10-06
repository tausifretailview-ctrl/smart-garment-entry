# wa-gateway

Self-hosted multi-tenant WhatsApp gateway (Baileys) behind EzzyERP's **"Our WhatsApp"** send option.
One QR-linked session per organization; auth state persists in `/data` (Docker volume).

## Run
```bash
export GATEWAY_API_KEY=$(openssl rand -hex 32)
export APP_EVENT_URL=https://<project>.supabase.co/functions/v1/whatsapp-gateway-proxy
docker compose up -d --build
```
Put it behind HTTPS (Caddy/nginx). Then set Supabase edge function secrets and redeploy:
```bash
supabase secrets set WA_GATEWAY_URL=https://wa.example.com WA_GATEWAY_KEY=<GATEWAY_API_KEY>
supabase functions deploy send-whatsapp whatsapp-gateway-proxy
```

## API (header `x-api-key`)
| Method | Path | Body |
|---|---|---|
| POST | `/sessions/:orgId/start` | – (returns `qr` data URL) |
| GET | `/sessions/:orgId/status` | – |
| DELETE | `/sessions/:orgId` | – (logout) |
| POST | `/sessions/:orgId/send-text` | `{phone, message}` |
| POST | `/sessions/:orgId/send-file` | `{phone, fileUrl, filename, caption}` |
| POST | `/sessions/:orgId/check-number` | `{phone}` → `{exists}` |

Ban protection: sends are serialized per org with a 2–5 s random gap and a daily cap (`MAX_MSGS_PER_DAY`, default 300).
Run a single replica (sessions live in memory). Uses the unofficial WhatsApp Web protocol; Meta may restrict numbers.
