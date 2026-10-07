-- Performance: missing indexes found by static audit (additive only, no drops).
-- NOT YET APPLIED to production. Review against the live schema first.
--
-- Plain CREATE INDEX IF NOT EXISTS is used because migration runners wrap statements in a
-- transaction (CREATE INDEX CONCURRENTLY would fail there). On large tables (whatsapp_logs,
-- whatsapp_messages, voucher_entries) prefer running each statement separately in the SQL
-- editor, off-peak, with CONCURRENTLY added, e.g.:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whatsapp_logs_wamid_created ON ...;

-- customer_advances: only a unique advance_number index existed.
-- useCustomerAdvances.tsx, CustomerLedger.tsx, SettleCustomerAccountDialog.tsx, AddAdvanceBookingDialog.tsx
CREATE INDEX IF NOT EXISTS idx_customer_advances_org_customer_date
  ON public.customer_advances (organization_id, customer_id, advance_date);

-- whatsapp_logs: delivery-status webhook looks up by wamid (_shared/whatsappStatusWebhook.ts).
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_wamid_created
  ON public.whatsapp_logs (wamid, created_at DESC) WHERE wamid IS NOT NULL;

-- sale_returns: by customer (CustomerLedger.tsx) and by linked invoice (InvoiceHistoryDialog.tsx).
CREATE INDEX IF NOT EXISTS idx_sale_returns_org_customer_active
  ON public.sale_returns (organization_id, customer_id, return_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sale_returns_org_linked_sale_active
  ON public.sale_returns (organization_id, linked_sale_id)
  WHERE deleted_at IS NULL AND linked_sale_id IS NOT NULL;

-- whatsapp_messages: inbox unread queries (whatsappInboxUnread.ts) and thread view (WhatsAppInbox.tsx).
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_dir_type
  ON public.whatsapp_messages (organization_id, direction, message_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_sent
  ON public.whatsapp_messages (conversation_id, sent_at);

-- voucher_entries: type + date range, and org-scoped party lookup (CustomerLedger.tsx).
CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_type_date
  ON public.voucher_entries (organization_id, voucher_type, voucher_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_reftype_ref
  ON public.voucher_entries (organization_id, reference_type, reference_id) WHERE deleted_at IS NULL;
