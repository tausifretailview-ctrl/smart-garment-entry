# Suspend Organization for Non-Payment

Block a specific organization (Kids Zone, slug `kids-zone`) from using the app, show a "Payment Pending" message, and sign the user out. Easy to reverse once payment is received.

## Approach

Add a per-organization `is_suspended` flag plus optional `suspension_message`. When the current organization is suspended, render a full-screen "Payment Pending" block and force sign-out. RLS already scopes everything per org, so flipping the flag in DB instantly suspends only that org — no other tenants impacted.

## Steps

1. **DB migration** — add columns to `organizations`:
  - `is_suspended boolean not null default false`
  - `suspension_reason text` (defaults to a friendly payment-pending message when null)
  - Include in the existing `organizations` SELECT in `OrganizationContext` so client knows.
  - Set `is_suspended = true` for `slug = 'kids-zone'` in the same migration.
2. **Frontend gate** (`src/contexts/OrganizationContext.tsx` + a new `SuspendedOrgScreen` component):
  - Extend `Organization` interface with `is_suspended`, `suspension_reason`.
  - Add to the `select(...)` in `queryMemberships`.
  - In a top-level wrapper (e.g. `App.tsx` or inside `OrganizationProvider`'s consumer at `AppLayout`), if `currentOrganization?.is_suspended` is true:
    - Render `<SuspendedOrgScreen />` instead of children.
    - Show: org name, "Payment Pending — Your subscription is on hold. Please complete payment to resume." plus contact info (WhatsApp / phone — to confirm with user).
    - Provide a "Sign Out" button calling `supabase.auth.signOut()`.
    - Auto sign-out after ~5 seconds so no stale session lingers.
  - Platform admin route (`/platform-admin`) must remain accessible (skip the gate when user has `platform_admin` role) so support can unsuspend.
3. **Unsuspend flow** — When payment received, simply run:
  ```sql
   UPDATE organizations SET is_suspended = false WHERE slug = 'kids-zone';
  ```
   No code change required. (Optional follow-up: add a toggle in Platform Admin UI — out of scope for this task unless requested.)

## Files to touch

- `supabase/migrations/<new>.sql` — add columns, suspend kids-zone.
- `src/contexts/OrganizationContext.tsx` — add fields to interface + query.
- `src/components/SuspendedOrgScreen.tsx` (new) — payment-pending UI + signout.
- `src/App.tsx` (or appropriate layout) — render gate before app routes (excluding platform-admin route).

## Open question

What contact details should appear on the Payment Pending screen (phone / WhatsApp number / message)? Default if you don't specify: "Please contact support to resume your subscription." Contact Number: +919820330995