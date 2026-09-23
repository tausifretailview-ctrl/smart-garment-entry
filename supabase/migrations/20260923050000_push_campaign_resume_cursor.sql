-- A4 guardrail — marketing campaign resume cursor (additive only).
-- REVIEW ONLY. Do not apply without sign-off.
--
-- Adds push_campaigns.last_sent_offset so push-send's marketing loop can
-- resume from where a previous invocation stopped instead of restarting
-- from subscriber 0 (campaign pushes have sale_id IS NULL, so the invoice
-- partial unique index does not dedupe them — a naive retry today
-- double-notifies everyone already sent).
--
-- No table/policy/function/grant changes: the existing org-member UPDATE
-- policy already covers the new column, service_role (edge function)
-- bypasses RLS, and no new anon RPCs are added — the anon allow-list is
-- untouched. Full batching/queueing is intentionally out of scope.

BEGIN;

ALTER TABLE public.push_campaigns
  ADD COLUMN IF NOT EXISTS last_sent_offset integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.push_campaigns.last_sent_offset IS
  'Resume cursor for marketing sends: number of audience rows already processed by push-send. Advanced after every processed target; the campaign is marked done when a fetch returns fewer rows than the per-invocation send cap.';

COMMIT;
