# Owner alerts on the Android app — setup

Owner phone notifications: cashier report every 2 or 3 hours (shop hours), low-stock alert,
bill alert (every bill or above an amount), day-end summary. Sent by the `owner-alerts`
edge function through Firebase Cloud Messaging to the EzzyERP Android app.

## One-time setup (in this order)
1. **Database** — run `supabase/migrations/20261231170000_owner_alerts.sql` on DEMO first,
   then in the live SQL editor. It only adds tables and a 15-minute cron that does nothing
   until a shop turns alerts on.
2. **Edge function** — `supabase functions deploy owner-alerts`. It uses the existing
   `FIREBASE_SERVICE_ACCOUNT_JSON` secret (same as `push-send`); no new secret.
3. **Firebase Android app** — Firebase console → the same project → Add app → Android,
   package `com.ezzyerp.app`. Download `google-services.json` and place it at
   `android/app/google-services.json` on the build machine (do not paste it in chat).
4. **APK** — `npm ci && npm run build && npx cap sync android`, then build and install the
   APK. Owners must install this new APK once.

## Turning it on for a shop
Settings → POS → **Owner alerts (mobile app)**:
- On the owner's phone (Android app): **Turn on alerts on this phone** → allow notifications.
- Choose cashier report every 2 or 3 hours, shop hours, low-stock times and level, bill alert
  (off / every bill / above ₹X), day-end time. Turn **Owner alerts** on and **Save owner alerts**.
- **Send test alert** checks delivery.

All times are India Standard Time. Each alert is logged in `owner_push_log` with a unique key,
so a repeated cron run never sends it twice.
