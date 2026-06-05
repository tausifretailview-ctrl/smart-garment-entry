# Issue: INV/26-27/47 (ALANKAR FOOTWEAR) wrongly shows "Paid"

## Database is correct
Verified via SQL on `sales` for KS Footwear (org `4bc73037…`):

| Invoice | Customer | Net | Paid | Status (DB) |
|---|---|---|---|---|
| INV/26-27/47 | ALANKAR FOOTWEAR- NALASOPARA | ₹4,291 | 0 | **pending** ✅ |
| INV/26-27/171 | ALANKAR FOOTWEAR | ₹12,857 | 0 | pending ✅ |
| INV/26-27/189 | ALANKAR FOOTWEAR | ₹1,674 | 0 | pending ✅ |
| INV/26-27/318 | ALANKAR FOOTWEAR | ₹16,823 | 0 | pending ✅ |
| INV/26-27/40 (Milan) | MILAN SHOES MALAD | ₹7,785 | 0 | pending ✅ |

So the WhatsApp reminder and Outstanding ledger are RIGHT. The Sales Dashboard's "Paid" badge for these rows is WRONG — same bug we diagnosed last week for INV/26-27/40.

## Root cause (same as before — never fixed in build mode)
`src/components/InvoiceHistoryDialog.tsx` line ~167 uses
```ts
.ilike("description", `%${saleNumber}%`)
```
So when you open `INV/26-27/47`, it pulls receipts whose description mentions `INV/26-27/470, 471, …, 479` and renders them as if they paid invoice 47. Short numbers (1–2 digits) suffer the worst — `/3` matches `/30…/399`, `/47` matches `/470…/479`, etc.

For `INV/26-27/47` specifically, sibling `INV/26-27/471` has ₹6,447 paid → dialog shows it as Paid/Settled and the dashboard inherits the badge.

## Scope of impact (KS Footwear only, queried just now)
**48 invoices across 38 customers** in KS Footwear currently display a wrong "Paid/Partial" badge because their sale_number is a substring of a longer paid invoice. Worst offenders:

| Pending invoice | Customer | Sibling paid invoices leaking in |
|---|---|---|
| INV/26-27/3 | SHREE JI FOOTWEAR-KANDIVALI W | 31 |
| INV/26-27/5 | MAYUR FOOTWEAR-MALAD E | 12 |
| INV/25-26/36 | PARFECT SHOE KURAR VILLAGE | 10 |
| INV/25-26/67 | MUSKAN FOOTWAR-GORGAON E | 10 |
| INV/25-26/14 | SHREE FOOTWEAR-DOMBIVALI E | 10 |
| INV/25-26/30 | SHOE PALECE MIRA ROAD | 10 |
| INV/26-27/6 | JOHNSON ENTERPRISES MIRA-ROAD | 10 |
| … 41 more rows | | 1-8 |

Same code path runs for every organization, so other tenants with short sale numbers are silently affected too — but the symptom only surfaces once the longer sibling is paid.

## Fix (frontend only, no DB change)

Edit `src/components/InvoiceHistoryDialog.tsx`:

1. Keep the existing `.ilike('description', '%${saleNumber}%')` as a coarse pre-filter (index-friendly).
2. After the query, filter the result with the **word-bounded extractor** already used (correctly) by the dashboard / ledger / outstanding code:

```ts
import { extractSaleNumbersFromReceiptDescription } from "@/utils/customerBalanceUtils";

customerVouchers = (custV || []).filter(v =>
  extractSaleNumbersFromReceiptDescription(v.description || "").includes(saleNumber)
);
```

That tokeniser already splits on whitespace / pipes / commas and matches whole invoice numbers, so `INV/26-27/47` will never absorb `INV/26-27/471`.

## Verification after fix
1. Open `INV/26-27/47` (ALANKAR) → History timeline empty, Balance Due ₹4,291, status **Pending**.
2. Open `INV/26-27/471` → still shows its ₹6,447 receipt and stays Partial/Paid as before.
3. Spot-check 3 of the high-leak rows above (e.g. INV/26-27/3, INV/26-27/5) → no more false Paid badge.
4. Customer Ledger / Outstanding / WhatsApp reminders unchanged (they already use the correct extractor).

## No data migration needed
`sales.paid_amount` and `payment_status` are already correct in Postgres. This is purely a display bug in one component. Once the patch is in, the 48 affected invoices in KS Footwear (and any equivalent rows in other orgs) will display correctly without any backfill.

Approve to switch to build mode and apply the one-file patch.
