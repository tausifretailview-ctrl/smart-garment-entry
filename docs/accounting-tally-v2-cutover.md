# Tally v2 GL posting — cutover runbook (Phase B)

After **Phase A** migration (`20260701120000_accounting_phase_a_tally_foundation.sql`) and **Phase B** app deploy, sale/purchase journals use:

- **Purchase:** DR Stock-in-Hand (1300) + Input GST / CR AP + Cash-Bank  
- **Sale:** DR Cash/AR, CR Sales (taxable) + Output GST + other charges, DR COGS / CR Stock, DR Trade Discount (flat discount, points, legacy header orphan only — not line discounts already in `line_total`), explicit Round Off (6900)  
- **Returns:** GST and inventory/COGS reversal where applicable  

Posting activates automatically when system account **1300 Stock-in-Hand** exists (seeded in Phase A).

## Re-backfill (required for historical GL accuracy)

Per organization (admin):

1. **Accounts → Reset GL ledger** (`admin_reset_org_gl`) — wipes journals and sets `journal_status` to `pending` on sales, purchases, and returns.  
2. **Run historical backfill** — posts all pending rows with Tally v2 logic.  
3. Compare **GL Trial Balance** vs operational tabs for a sample month before sign-off.

## Notes

- COGS at sale uses `sale_items.quantity × product_variants.pur_price` (same as operational P&L).  
- Purchase GST splits header `gst_amount` 50/50 CGST/SGST (IGST when extended later).  
- Party subledger fields on `journal_lines` are populated on AR/AP lines when customer/supplier id is present.
