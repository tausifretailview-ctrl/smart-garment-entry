
## Root cause

The WhatsApp edge function correctly auto-fills `instagram` and `google_review_link` params from `whatsapp_api_settings.social_links` (lines 977-986 of `send-whatsapp/index.ts`). But for the failing org ("Adtech Agency"), these fields are saved as **empty strings** in the DB — so the trim-and-validate guard at line 1008 rejects the message with `TEMPLATE_PARAMS_EMPTY` at indexes 5, 6.

DB confirms: most orgs have `social_links: { instagram: "", google_review: "", ... }` — empty.

Two real problems:
1. **No graceful fallback** when an org hasn't filled social links → the whole message fails instead of substituting a placeholder or skipping.
2. **The Settings UI exists** (WhatsApp Settings → Social Links section already has Instagram, Facebook, Website, Google Review inputs), but the user likely never filled it in for Adtech Agency, and the error message doesn't tell them what to do.

## Fix plan

### 1. Edge function — graceful fallback for social-link params (`supabase/functions/send-whatsapp/index.ts`)

For the known auto-fill social fields (`instagram`, `facebook`, `website`, `google_review_link`), if both saleData and `social_links` are empty, substitute a **safe placeholder** (a single dash `-` or the org name's default landing) instead of empty string. WhatsApp accepts non-empty text and the message goes through. This is preferable to silently failing because the user sees the params but they're fillers.

Specifically: change the enrichment block (lines 980-986) so the final value is `value || socialLinks.X || '-'` — never empty.

Also, when `TEMPLATE_PARAMS_EMPTY` is still triggered (non-social params actually missing), include a clearer hint in `error_message` listing the **field names** (e.g. "google_review_link, instagram") not just indexes — looked up via the active param mapping for that template.

### 2. UX — surface "social links not configured" warning in WhatsApp Settings (`src/components/WhatsAppAPISettings.tsx`)

In the Social Links section, when any field used by an active template's param mapping is empty, show an inline amber warning: "These links are referenced by your active template; empty values will be replaced with '-'." Non-blocking, just informative.

### 3. Sale data plumbing — forward `google_review_link` (`src/hooks/useSaveSale.tsx` line 458)

Add `google_review_link: socialLinks.google_review || ''` to the saleData payload alongside website/instagram/facebook so direct invocations (not just the edge-function fallback) carry it.

### Files touched
- `supabase/functions/send-whatsapp/index.ts` — fallback `'-'` for social params; clearer error message with field names.
- `src/components/WhatsAppAPISettings.tsx` — inline warning when social links empty.
- `src/hooks/useSaveSale.tsx` — forward `google_review_link` in saleData.

### Acceptance
- Sending a sales_invoice via the 7-param template to an org with empty `social_links` → message succeeds with `-` shown for missing links (no `TEMPLATE_PARAMS_EMPTY`).
- Filling Instagram + Google Review URLs in WhatsApp Settings → next message shows real links.
- Settings page shows amber hint when active template references social fields not yet filled.

<lov-actions>
<lov-suggestion message="Approved — proceed with all 3 fixes">Proceed with the fix</lov-suggestion>
<lov-suggestion message="Only apply the edge function fallback (skip the UI warning and useSaveSale change)">Edge function only</lov-suggestion>
<lov-suggestion message="Instead of using '-' as fallback, skip sending when social links are empty and show a clear toast in the UI">Skip-and-toast variant</lov-suggestion>
<lov-suggestion message="After the fix, send a test sales_invoice via WhatsApp end-to-end and confirm the message arrives">Verify end-to-end after fix</lov-suggestion>
</lov-actions>
