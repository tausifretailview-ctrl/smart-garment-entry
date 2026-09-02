-- Phase 3 BEFORE migrate — paste this entire file and Run.
-- Expect search_invoice_sale_ids + search_pos_sale_ids only.
-- search_line_item_sale_ids appears only AFTER this PR's migration.

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'search_line_item_sale_ids',
    'search_invoice_sale_ids',
    'search_pos_sale_ids'
  )
ORDER BY 1, 2;
