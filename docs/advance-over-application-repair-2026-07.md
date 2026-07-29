# Advance over-application repair — ELLA NOOR (2026-07)

**Org:** `3fdca631-1e0c-4417-9704-421f5129ff67`  
**Prerequisite:** Apply migration `20260729140000_attach_guard_advance_over_application.sql` first.  
**Do not** set `sales.paid_amount` manually. Soft-delete excess vouchers only; let receipt sync / triggers recompute.

Known excess invoices (Σ advance_adjustment > net_amount + 1):

| sale_number | excess (approx) |
|---|---:|
| INV/26-27/362 | ₹33,300 |
| INV/26-27/152 | ₹10,950 |
| INV/25-26/534 | ₹4,000 |
| INV/26-27/1746 | ₹2,000 |

**Strategy:** Keep earliest live `advance_adjustment` vouchers until cumulative Σ reaches `net_amount`. Soft-delete the rest (`deleted_at = now()`). Then recompute `customer_advances.used_amount` for that customer (trigger should fire; call RPC helper explicitly as belt-and-suspenders).

---

## Control query (Part C / INV-09) — run before and after

```sql
SELECT s.sale_number, s.net_amount, SUM(ve.total_amount) AS advance_applied,
       SUM(ve.total_amount) - s.net_amount AS excess
FROM sales s
JOIN voucher_entries ve ON ve.reference_id = s.id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND ve.organization_id = s.organization_id
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'advance_adjustment'
  AND ve.deleted_at IS NULL
  AND s.deleted_at IS NULL
GROUP BY s.id, s.sale_number, s.net_amount
HAVING SUM(ve.total_amount) > s.net_amount + 1
ORDER BY excess DESC;
```

**Expect before repair:** exactly the 4 invoices above.  
**Expect after repair:** 0 rows.

---

## INV/26-27/362 — Siya Kapoor (do first)

### B0 — Resolve ids (backup SELECT → CSV)

```sql
-- Sale + customer
SELECT s.id AS sale_id, s.sale_number, s.net_amount, s.paid_amount, s.payment_status,
       s.customer_id, c.customer_name
FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND s.sale_number = 'INV/26-27/362'
  AND s.deleted_at IS NULL;

-- All live advance_adjustment vouchers (ordered = keep order)
SELECT ve.id, ve.voucher_number, ve.voucher_date, ve.created_at,
       ve.total_amount, ve.payment_method, ve.description, ve.deleted_at
FROM voucher_entries ve
JOIN sales s ON s.id = ve.reference_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND s.sale_number = 'INV/26-27/362'
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'advance_adjustment'
  AND ve.deleted_at IS NULL
ORDER BY ve.created_at ASC NULLS LAST, ve.voucher_number ASC;

-- Customer advances (Siya)
SELECT ca.id, ca.advance_number, ca.amount, ca.used_amount, ca.status, ca.advance_date
FROM customer_advances ca
JOIN sales s ON s.customer_id = ca.customer_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND s.sale_number = 'INV/26-27/362'
  AND ca.organization_id = s.organization_id
ORDER BY ca.advance_date, ca.created_at;

-- Preview which vouchers would be soft-deleted (cum already covers net before this row)
WITH sale AS (
  SELECT id, net_amount, customer_id
  FROM sales
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
    AND sale_number = 'INV/26-27/362'
    AND deleted_at IS NULL
),
ordered AS (
  SELECT ve.id, ve.voucher_number, ve.total_amount, ve.created_at, ve.description,
         SUM(ve.total_amount) OVER (
           ORDER BY ve.created_at ASC NULLS LAST, ve.voucher_number ASC
         ) AS cum_incl
  FROM voucher_entries ve
  JOIN sale s ON s.id = ve.reference_id
  WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
    AND ve.voucher_type = 'receipt'
    AND ve.payment_method = 'advance_adjustment'
    AND ve.deleted_at IS NULL
)
SELECT o.*,
       (o.cum_incl - o.total_amount) AS cum_before,
       CASE WHEN (o.cum_incl - o.total_amount) >= (SELECT net_amount FROM sale) - 0.01
            THEN 'SOFT_DELETE' ELSE 'KEEP' END AS action
FROM ordered o
ORDER BY o.created_at, o.voucher_number;
```

**Expected for INV/362:** KEEP RCP/…/2827 + 2828 (Σ ₹33,300); SOFT_DELETE 2829–2832 (Σ ₹33,300).  
**Expected soft-delete row count:** 4.

### B1 — Transaction (stop before COMMIT; verify first)

```sql
BEGIN;

-- Capture ids into a temp table for the sale
CREATE TEMP TABLE _fix_362 ON COMMIT DROP AS
WITH sale AS (
  SELECT id AS sale_id, net_amount, customer_id, organization_id, paid_amount
  FROM sales
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
    AND sale_number = 'INV/26-27/362'
    AND deleted_at IS NULL
),
ordered AS (
  SELECT ve.id AS voucher_id, ve.voucher_number, ve.total_amount,
         SUM(ve.total_amount) OVER (
           ORDER BY ve.created_at ASC NULLS LAST, ve.voucher_number ASC
         ) AS cum_incl,
         s.sale_id, s.net_amount, s.customer_id, s.organization_id, s.paid_amount
  FROM voucher_entries ve
  JOIN sale s ON s.id = ve.reference_id AND ve.organization_id = s.organization_id
  WHERE ve.voucher_type = 'receipt'
    AND ve.payment_method = 'advance_adjustment'
    AND ve.deleted_at IS NULL
)
SELECT *
FROM ordered
WHERE (cum_incl - total_amount) >= net_amount - 0.01;

-- Expect 4 rows
SELECT COUNT(*) AS excess_voucher_count, COALESCE(SUM(total_amount),0) AS excess_amount
FROM _fix_362;
-- excess_voucher_count = 4, excess_amount = 33300

-- 1) Soft-delete excess vouchers (expect UPDATE 4)
UPDATE voucher_entries ve
SET deleted_at = NOW(),
    updated_at = NOW()
FROM _fix_362 x
WHERE ve.id = x.voucher_id
  AND ve.deleted_at IS NULL;

-- 2) Recompute used_amount from remaining live advance vouchers
--    (AFTER UPDATE trigger should also call this; invoke explicitly)
SELECT public.recompute_customer_advances_used(
  (SELECT organization_id FROM _fix_362 LIMIT 1),
  (SELECT customer_id FROM _fix_362 LIMIT 1)
);

-- Normalize status vocabulary to app conventions (recompute historically wrote 'used')
UPDATE customer_advances ca
SET status = CASE
  WHEN COALESCE(ca.used_amount,0) >= ca.amount - 0.01 AND ca.amount > 0 THEN 'fully_used'
  WHEN COALESCE(ca.used_amount,0) > 0 THEN 'partially_used'
  ELSE 'active'
END
WHERE ca.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND ca.customer_id = (SELECT customer_id FROM _fix_362 LIMIT 1);

-- === VERIFY (before COMMIT) ===
SELECT s.sale_number, s.net_amount, s.paid_amount,
       (SELECT COALESCE(SUM(ve.total_amount),0)
        FROM voucher_entries ve
        WHERE ve.reference_id = s.id
          AND ve.payment_method = 'advance_adjustment'
          AND ve.deleted_at IS NULL) AS advance_applied
FROM sales s
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND s.sale_number = 'INV/26-27/362';
-- Expect: advance_applied = 33300, paid_amount = 33300 (unchanged)

SELECT ROUND(SUM(ca.amount - COALESCE(ca.used_amount,0))::numeric, 2) AS unused_advance
FROM customer_advances ca
WHERE ca.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND ca.customer_id = (SELECT customer_id FROM _fix_362 LIMIT 1);
-- Expect: unused_advance = 33300 (Siya acceptance)

-- Outstanding / net position: use your ledger snapshot / get_customer_financial_snapshot
-- Acceptance: Outstanding ₹11,600 unchanged; Net Position ₹21,700 Cr

-- If verify fails:
-- ROLLBACK;

COMMIT;
```

### Rollback path

- Before `COMMIT`: `ROLLBACK;`  
- After `COMMIT`: clear `deleted_at` on the four voucher ids from the B0 CSV backup, then `SELECT recompute_customer_advances_used(org, customer)` again and normalize status.

---

## Other three invoices — same pattern

Replace `INV/26-27/362` with:

1. `INV/26-27/152` (expect soft-delete Σ ≈ ₹10,950)  
2. `INV/25-26/534` (≈ ₹4,000)  
3. `INV/26-27/1746` (≈ ₹2,000)

For each:

1. Run B0 backup SELECTs → CSV  
2. Run preview `SOFT_DELETE`/`KEEP` query; confirm excess Σ matches table above  
3. Run the same `BEGIN`…verify…`COMMIT` block with the sale_number substituted  
4. Re-run control INV-09 (must shrink by one invoice each time)

Do **not** batch all four in one transaction until 362 is verified in the UI (Siya unused advance ₹33,300, outstanding ₹11,600).

---

## Acceptance checklist (362)

- [ ] Live advance vouchers Σ = ₹33,300 (not ₹66,600)  
- [ ] Siya unused advance = ₹33,300  
- [ ] Outstanding = ₹11,600 (unchanged)  
- [ ] Net Position = ₹21,700 Cr  
- [ ] `paid_amount` on INV/362 still ₹33,300  
- [ ] INV-09 control returns 3 remaining, then 0 after all repairs  
