-- Review item B6 (22 Nov 2026): a bill sent twice is saved once.
--
-- A new bill is saved in one request (save_sale_with_items_atomic / _numbered). When that
-- request commits but its reply is lost (shop network drops for a moment), the counter shows
-- "Error saving sale" with the cart still full. The cashier presses Save again and a second
-- bill is created: new number, stock taken twice.
--
-- The app now sends a request id with every new bill and reuses it when the same bill is
-- saved again. This script adds the column and the rule that makes the second insert fail;
-- the app then opens the bill that is already saved instead of creating another.
--
--   * sales.client_request_id: text, empty for every existing bill.
--   * uq_sales_client_request: one bill per (shop, request id). Bills without an id
--     (all old bills, bills saved offline, bills from an older app version) are not affected.
--
-- No function is changed: the save functions write every real column they are given, so the
-- new column is filled as soon as it exists. Until this script is run the app works as before
-- (the id is ignored).
--
-- Run at a quiet time: creating the index reads the sales table once (a few seconds on a
-- large database) and new bills wait during it.
-- UNDO: DROP INDEX public.uq_sales_client_request;
--       ALTER TABLE public.sales DROP COLUMN client_request_id;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_client_request
  ON public.sales (organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.sales.client_request_id IS
  'Request id sent by the app with a new bill. The same bill saved again (reply of the first save lost) hits uq_sales_client_request instead of creating a second bill.';
