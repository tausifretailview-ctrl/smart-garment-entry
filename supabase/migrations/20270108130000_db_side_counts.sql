-- DB-side counts replacing browser-side counting of every row.
-- NOT YET APPLIED to production. The app falls back to the old row-pulling queries
-- while these functions do not exist, so shipping the frontend first is safe.
-- All functions are SECURITY INVOKER: row-level security still limits rows to the caller's orgs.

-- 1) Open invoices per customer (SalesmanOutstanding).
-- Same filters as fetchAllSalesSummary (src/utils/fetchAllRows.ts) plus the
-- payment_status <> 'completed' check from SalesmanOutstanding.tsx.
CREATE OR REPLACE FUNCTION public.get_customer_open_invoice_counts(p_organization_id uuid)
RETURNS TABLE (customer_id uuid, open_invoice_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT s.customer_id, count(*)::bigint
  FROM public.sales s
  WHERE s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND s.payment_status <> 'hold'
    AND s.is_cancelled = false
    AND s.payment_status <> 'completed'
    AND s.customer_id IS NOT NULL
  GROUP BY s.customer_id;
$$;

-- 2) Unread customer replies per conversation (whatsappInboxUnread.ts).
CREATE OR REPLACE FUNCTION public.get_whatsapp_unread_by_conversation(p_organization_id uuid)
RETURNS TABLE (conversation_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT m.conversation_id, count(*)::bigint
  FROM public.whatsapp_messages m
  WHERE m.organization_id = p_organization_id
    AND m.direction = 'inbound'
    AND m.message_type IN ('text','button','interactive','image','document','audio','video')
    AND m.read_at IS NULL
    AND m.conversation_id IS NOT NULL
  GROUP BY m.conversation_id;
$$;

-- 3) Conversations with at least one customer reply (whatsappInboxUnread.ts).
CREATE OR REPLACE FUNCTION public.get_whatsapp_reply_conversation_ids(p_organization_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT m.conversation_id
  FROM public.whatsapp_messages m
  WHERE m.organization_id = p_organization_id
    AND m.direction = 'inbound'
    AND m.message_type IN ('text','button','interactive','image','document','audio','video')
    AND m.conversation_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_customer_open_invoice_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_whatsapp_unread_by_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_whatsapp_reply_conversation_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_open_invoice_counts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_unread_by_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_reply_conversation_ids(uuid) TO authenticated, service_role;

-- Equivalence check to run on a NON-production copy before relying on it:
--   SELECT customer_id, count(*) FROM public.sales
--   WHERE organization_id = '<org>' AND deleted_at IS NULL AND payment_status <> 'hold'
--     AND is_cancelled = false AND payment_status <> 'completed' AND customer_id IS NOT NULL
--   GROUP BY customer_id;
--   -- must match: SELECT * FROM public.get_customer_open_invoice_counts('<org>');
-- (PostgREST .neq('payment_status','hold') also drops NULL payment_status, same as <> here.)
