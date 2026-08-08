# Ella Noor — Parishma Memon (9624697786) ledger vs invoice dashboard mismatch

## What I checked
Customer `PARISHMA MEMON`, phone 9624697786, Ella Noor. Compared the invoice dashboard screenshot, the uploaded ledger PDF, and the live data (sales, customer_advances, voucher_entries).

## Finding: the bill list is not the problem — duplicate receipts are

Both the dashboard and the ledger list exactly the same 3 invoices (₹2,900 + ₹5,120 + ₹6,300 = ₹14,320). Nothing is missing.

The real mismatch is the balance. Invoice INV/26-27/1653 is ₹5,120, but it has **four** receipts against it totalling ₹10,240:

```text
RCP/26-27/1916  18/06  ₹2,560  UPI                 <- genuine
RCP/26-27/1917  18/06  ₹2,560  UPI                 <- duplicate (created 13:46:56)
RCP/26-27/1918  18/06  ₹2,560  UPI                 <- duplicate (created 13:49:12)
RCP/26-27/1978  21/06  ₹2,560  advance adjustment  <- genuine (from ADV/26-27/361)
```

The three UPI receipts were saved within ~3 minutes of each other — a double/triple submit. That ₹5,120 of phantom credit is why the ledger prints "Rs. 2,560 Cr" while the dashboard shows ₹6,300 pending and ₹3,740 unused advance.

Correct position once the two duplicates are removed:
- Invoiced ₹14,320; genuine cash/UPI ₹5,460 (₹2,900 + ₹2,560); advance applied ₹2,560
- INV/26-27/2169 stays fully pending at ₹6,300
- Unused advance ₹3,740 (₹590 of ADV/361 + ₹1,750 + ₹1,400) — matches the dashboard's "Adjust Advance ₹3,740"
- Party balance = **₹2,560 Dr**, not ₹2,560 Cr

So the invoice dashboard is currently right; the ledger is inflated by the duplicates.

## Fix

1. Soft-delete the two duplicate receipt vouchers `RCP/26-27/1917` and `RCP/26-27/1918` (scoped to Ella Noor org id and those two voucher ids only), so they drop out of the ledger and the reconciliation footer.
2. Re-derive INV/26-27/1653 settlement: ₹2,560 UPI + ₹2,560 advance = ₹5,120, `payment_status = completed` (unchanged in value, just re-confirmed against the surviving vouchers).
3. Re-run the customer balance reconciliation for this customer and verify the ledger PDF then prints ₹2,560 Dr and cash received ₹5,460.

No other customer, invoice, or advance is touched. Advances ADV/26-27/361, 648, 652 are left as they are.

## Optional follow-up (say if you want it)
Add a duplicate-receipt guard: block saving a receipt for the same invoice with the same amount within a short window (the same pattern already used for the 5-minute duplicate block in school fee collection), so this triple-submit cannot recur. I can also scan all Ella Noor invoices for the same over-receipt pattern and report the list before changing anything.

## Technical notes
- Org `3fdca631-1e0c-4417-9704-421f5129ff67`, customer `4822a0a8-0328-430b-944a-ece95ca118a2`, sale `9988583e-ed50-4bb1-8d85-bc3f11e5cfe1`.
- Change is a migration using soft delete (`deleted_at`/`deleted_by`) per the project's soft-delete policy — no hard delete.
