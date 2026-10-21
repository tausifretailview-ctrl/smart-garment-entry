# wa-gateway (Ezzy ERP WhatsApp)

Self-hosted multi-tenant WhatsApp gateway (Baileys) behind the **Ezzy ERP WhatsApp** send option
(`whatsapp_api_settings.send_provider = 'builtin'`). Each shop links its own number by scanning a QR
in Settings → WhatsApp API. One session per organization; login state persists in `/data`.

Supabase edge functions cannot hold a WhatsApp session open, so this runs on its own server
(any small Linux VPS with Docker, 1 GB RAM is enough for dozens of shops).

## Setup
1. Point a domain at the server (DNS A record), e.g. `wa.yourdomain.com`.
2. On the server:
   ```bash
   git clone <this repo> && cd smart-garment-entry/wa-gateway
   cp .env.example .env      # fill in WA_DOMAIN, GATEWAY_API_KEY (openssl rand -hex 32), SUPABASE_FUNCTIONS_URL
   docker compose up -d --build
   curl https://wa.yourdomain.com/health   # → {"ok":true}
   ```
3. Supabase → Edge Functions → Secrets: `WA_GATEWAY_URL=https://wa.yourdomain.com`,
   `WA_GATEWAY_KEY=<same GATEWAY_API_KEY>`.
4. Deploy edge functions `whatsapp-gateway-proxy`, `send-whatsapp`, `whatsapp-webhook`, and run
   migration `20261001120000_whatsapp_builtin_send_provider.sql` if not applied yet.
5. In the app: Settings → WhatsApp API → Send provider → **Ezzy ERP WhatsApp** (it appears once the
   server answers) → Connect WhatsApp → scan → turn integration on → Save Settings → Send test.

Update later: `git pull && docker compose up -d --build`. Linked shops reconnect on their own.

## API (header `x-api-key`)
| Method | Path | Body |
|---|---|---|
| GET | `/health` | – (no key) |
| POST | `/sessions/:orgId/start` | – (returns `qr` data URL) |
| GET | `/sessions/:orgId/status` | – |
| DELETE | `/sessions/:orgId` | – (logout) |
| POST | `/sessions/:orgId/send-text` | `{phone, message}` |
| POST | `/sessions/:orgId/send-file` | `{phone, fileUrl, filename, caption}` |
| POST | `/sessions/:orgId/check-number` | `{phone}` → `{exists}` |
| GET | `/sessions/:orgId/groups` | – → `{groups: [{id, name, size}]}` |
| POST | `/campaigns` | `{campaignId, sessionId: "u_<userId>", message, media?, minGapMs, maxGapMs, items: [{recipientId, phone, name}]}` |
| GET | `/campaigns/:id` | – (progress) |
| POST | `/campaigns/:id/pause` · `/resume` · `/stop` | – |

## Support tokens
Ezzy's own support number links as session `support` (Platform Admin > Support Tokens). The
support-tokens edge function sends each new token with `send-text`, `phone` = the group JID
(`...@g.us`). That session sends no status events, receipts or inbound messages to the app.

## Bulk WhatsApp
The Bulk WhatsApp page links each user's own number as session `u_<userId>` (same `/sessions/...`
routes), separate from the shop's bill number. Campaigns are saved under `/data/campaigns` and sent
one number at a time with a random 8–20 s gap and `MAX_BULK_MSGS_PER_DAY` per number (default 500;
the rest continue the next day). Numbers not on WhatsApp are marked failed without a send. Per-number
results, delivery and read ticks are posted to `APP_BULK_URL` (defaults to the `bulk-whatsapp`
function next to `APP_EVENT_URL`). Replies to bulk messages are not forwarded to the review flow.

Outgoing calls: connection changes → `APP_EVENT_URL` (whatsapp-gateway-proxy, `gateway-event`);
customer text replies → `APP_INBOUND_URL` (whatsapp-webhook, `ezzy-gateway-inbound`, drives the
OK → star review reply). Both carry the same `x-api-key`.

Ban protection: sends are serialized per org with a 2–5 s random gap and a daily cap
(`MAX_MSGS_PER_DAY`, default 300). An unscanned QR stops after WhatsApp's QR timeout instead of
looping. Run a single replica (sessions live in memory). This uses the unofficial WhatsApp Web
protocol, like WappConnect; WhatsApp may restrict or ban numbers that send bulk or spam.
