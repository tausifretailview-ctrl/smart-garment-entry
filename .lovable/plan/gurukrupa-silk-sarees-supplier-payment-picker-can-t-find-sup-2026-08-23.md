# Gurukrupa Silk Sarees — supplier payment picker can't find suppliers by the name on the bill

## What I found (verified against live data)

Org: Gurukrupa Silk Sarees. Every purchase bill in this org is correctly linked to a live supplier master (no orphans, no deleted masters). So the purchases are fine — the problem is **name spelling drift** between the bill snapshot and the supplier master.

Examples in this org (bill snapshot name → supplier master name):

- SARSWATI SAREE DEPOT LTD. (28 bills, ₹7.79L) → master is **SARASWATI** SAREE DEPOT LTD.
- MV TRADRERS (6 bills) → master is **M VISHAL TRADRERS**
- AVSAR CREATION (1 bill) → master is **AVSAR FASHION**
- GAYTRI SILK (2 bills) → master is **GAYATRI SILK**
- MAHI EXCLUSIVE → master is **MAAHI EXCLUSIVE**
- SAI SJHIV ENTERPRISES → master is **SAI SHIV ENTERPRISE**

MARUDHAR SAREES does exist as a master with 11 bills, of which 4 are unpaid (₹1,24,714 outstanding) — it should appear in the payment list. There is **no supplier or bill named "Samrudhi Saree Center"** anywhere in the database, so that one is either a different spelling of an existing master or was never created.

Why the payment screen fails: the supplier picker in Accounts → Supplier Payment searches **only the supplier master name**, and the dropdown additionally applies the command-menu's own fuzzy filter. Typing the name as printed on the purchase bill (e.g. "SARSWATI", "MV TRADRERS") returns "No supplier found", even though bills for that supplier are sitting unpaid.

## Fix

1. **Search bills, not just the master.** In the supplier payment picker, when the typed term doesn't match a master name, also look up `purchase_bills.supplier_name` (snapshot) in the org and resolve those bills' `supplier_id` back to their masters — same technique already used for the purchase bill dashboard search. Matches surface under a "Matched from bill name" group showing both names, e.g. `SARASWATI SAREE DEPOT LTD. (billed as SARSWATI SAREE DEPOT LTD.)`.
2. **Stop the double filter.** Disable the command menu's built-in fuzzy filtering in that picker so server/parent-filtered results are never silently hidden.
3. **Show every supplier that has unpaid bills.** The "Suppliers with Balance" group is driven by the balance snapshot; add a safety net so any supplier with `net_amount > paid_amount` on a non-deleted bill also appears, with its outstanding total.
4. **Cleanup (data, optional and separate).** After the search fix, the shop can use the existing Merge Suppliers tool to normalise the six drifted spellings above so the bill snapshots and masters agree going forward. No data change in this task.

## Before I build — one question

"Samrudhi Saree Center" does not exist in the data at all. Is it a new supplier to be created, or is it the shop's spoken name for one of the existing masters (which one)?

approval this plan Samrudhi Saree Center not supplier my typing mistake & update spelling all pages same for supplier & show all pending supplier invoices in list properly supplier payment 

## Technical notes

- Files: `src/components/accounts/SupplierPaymentTab.tsx` (picker query + groups, `<Command shouldFilter={false}>`), `src/utils/supplierSearch.ts` (new snapshot-name resolver alongside `searchSuppliers`).
- Reuse the paging/batching shape of `src/utils/purchaseBillDashboardSearch.ts`; all queries stay scoped to `organization_id` and `deleted_at is null`.
- Bill selection itself already runs off `supplier_id`, so once the right supplier is picked, all its bills — regardless of snapshot spelling — are already listed correctly. No change needed there.