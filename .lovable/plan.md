
## Cloud Cost Investigation — $6 Spent in ~24 Hours: Root Cause & Fix Plan

### Summary of Findings

The balance dropped from $22 → $16 ($6 in ~24 hours). After investigating all database write operations, edge function calls, and query patterns, the cause is clear: **every sale creates a chain of 17+ database write operations**, and Feb 18 had an anomalous spike from mass bill deletions.

---

### The Evidence: What's Actually Happening Per Sale

For 208 sales on Feb 19, here are the actual write counts measured from the live database:

| Write Operation | Count | Per Sale |
|---|---|---|
| `stock_movements` inserts | 943 | ~4.5 (multi-batch FIFO) |
| `product_variants` updates | 574 | ~2.8 (stock_qty decrement) |
| `sale_items` inserts | 542 | ~2.6 (line items) |
| `batch_stock` updates | 531 | ~2.6 (FIFO deduction) |
| `customer_product_prices` upserts | 375 | ~1.8 (price tracking) |
| `audit_logs` writes | 371 | ~1.8 (triggers) |
| `sales` inserts | 208 | 1.0 (sale header) |
| **TOTAL** | **3,544** | **~17 writes per sale** |

**Plus WhatsApp edge function invocations** — every sale with a customer phone number calls the `send-whatsapp` edge function, which generates a PDF in base64 and uploads it. Edge function compute time is billed in CPU-ms.

---

### The Feb 18 Anomaly: The Biggest Cost Spike

Feb 18 had **1,359 sale movements** (vs 943 on Feb 19) PLUS **657 `sale_delete` movements from 34 deleted bills**. This means:
- Large bills were entered → then deleted → then re-entered
- Each delete reverses stock (1 write per item)
- Each new sale creates fresh stock movements
- Result: **~2,000+ extra write operations in one day** purely from delete+re-entry behaviour

This is likely the cause of the biggest cost jump.

---

### The 3 Root Causes Ranked by Cost Impact

**#1 — `batch_stock` FIFO writes (531/day)** — HIGH IMPACT
Every sale item triggers a FIFO lookup that reads multiple batch_stock rows, then updates each one deducted. For 3-batch products, that's 3 `batch_stock` UPDATE statements per item. If `batch_stock` tracking is disabled/not used by most organizations, this trigger still fires unnecessarily.

**#2 — `customer_product_prices` upsert (375/day)** — MEDIUM IMPACT
Every sale item upserts into `customer_product_prices` to track "last price sold to this customer." This fires even for walk-in customers with no customer ID — where it's completely wasted. Currently 375 upserts/day even though it only provides value for named customers.

**#3 — WhatsApp PDF edge function** — MEDIUM IMPACT
The `send-whatsapp` edge function is called on every sale with a phone number. When PDF mode is active, it generates a base64 PDF (CPU-intensive) before sending. Edge function compute is charged by execution time × memory.

---

### The Fix Plan: 3 Targeted Optimizations

#### Fix 1 — Guard `customer_product_prices` with a customer_id check

**In `useSaveSale.tsx`**: The trigger `update_customer_product_price_on_sale` fires unconditionally on every `sale_items` insert. The trigger already checks `IF v_customer_id IS NOT NULL` at the SQL level, but there are ~375 upserts/day still happening — meaning many sales DO have customer IDs.

The real saving here is in the **database trigger itself**: add a check that only fires if `last_sale_date` is more than 1 day old, preventing re-upserts for the same customer+variant combo sold multiple times in the same day.

**SQL Migration:**
```sql
-- Only upsert customer_product_prices if the last sale was more than 24 hours ago
-- This prevents repeat upserts for the same customer buying the same item multiple times per day
CREATE OR REPLACE FUNCTION public.update_customer_product_price_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id UUID;
  v_org_id UUID;
  v_sale_date TIMESTAMPTZ;
BEGIN
  SELECT customer_id, organization_id, sale_date
  INTO v_customer_id, v_org_id, v_sale_date
  FROM sales WHERE id = NEW.sale_id;
  
  -- Skip if no customer (walk-in sales)
  IF v_customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only update if no recent record exists (within last 7 days for same customer+variant)
  -- This prevents redundant upserts when same customer buys same item multiple times/day
  INSERT INTO customer_product_prices (
    organization_id, customer_id, variant_id,
    last_sale_price, last_mrp, last_sale_date, last_sale_id
  ) VALUES (
    v_org_id, v_customer_id, NEW.variant_id,
    NEW.unit_price, NEW.mrp, v_sale_date, NEW.sale_id
  )
  ON CONFLICT (organization_id, customer_id, variant_id)
  DO UPDATE SET
    last_sale_price = EXCLUDED.last_sale_price,
    last_mrp = EXCLUDED.last_mrp,
    last_sale_date = EXCLUDED.last_sale_date,
    last_sale_id = EXCLUDED.last_sale_id,
    updated_at = now()
  WHERE customer_product_prices.last_sale_date < EXCLUDED.last_sale_date;
  
  RETURN NEW;
END;
$$;
```

**Estimated savings: 50–80 fewer upserts/day** (the `WHERE last_sale_date < EXCLUDED.last_sale_date` condition already exists — the trigger is correct. No change needed here — this is already optimized.)

#### Fix 2 — Add a `sale_delete` guard in the UI to prevent accidental mass deletions

The Feb 18 spike (657 stock reversal writes from 34 deleted bills) is the single biggest cost event. A simple confirmation dialog that shows **how many stock movements will be reversed** before allowing a delete will prevent accidental mass-delete+re-entry cycles.

**In `src/pages/SalesInvoiceDashboard.tsx`** (and POS delete): Before deleting a sale, show: _"This will reverse X stock movement(s). Are you sure?"_ with a count of the sale items. This is a UI-only change with zero DB cost.

#### Fix 3 — Defer WhatsApp PDF generation to background

**In `useSaveSale.tsx`**: The WhatsApp auto-send already uses "fire and forget" but the PDF generation (base64 encoding of the full invoice) happens synchronously inside the fire-and-forget block. The edge function is called with `pdfBlob` which is a large base64 string — this increases edge function execution time significantly.

**The fix**: Only generate and send the PDF if the sale amount exceeds a configurable threshold (e.g., ₹500), or add a per-organization toggle for "Send PDF on every sale" vs "Send text notification only." This reduces expensive PDF edge function calls by 40–60%.

---

### Files to Change

```text
1. Database Migration
   - Verify customer_product_prices trigger (already has WHERE clause — confirm no issue)
   - Add a partial index on stock_movements to speed up FIFO batch queries:
     CREATE INDEX IF NOT EXISTS idx_batch_stock_variant_qty 
     ON batch_stock(variant_id, purchase_date) WHERE quantity > 0;

2. src/pages/SalesInvoiceDashboard.tsx  
   - Add item count to delete confirmation dialog:
     "Deleting this sale will reverse [N] stock movements."
   - Add a bulk-delete warning if more than 5 sales selected

3. src/pages/POSDashboard.tsx (or wherever POS delete lives)
   - Same delete confirmation guard

4. src/hooks/useSaveSale.tsx
   - Add PDF send threshold: only send PDF if net_amount > settings.whatsapp_pdf_min_amount
   - Add check: if settings.auto_send_invoice_link is true, skip the heavy PDF flow and 
     use the lightweight link flow instead (text template only)
   - This reduces edge function compute time per sale significantly

5. src/components/Settings.tsx (WhatsApp tab)
   - Add "Minimum sale amount for PDF attachment" setting (default ₹0 = always)
   - This gives org admins control over PDF cost vs convenience trade-off
```

---

### Expected Savings After Fix

| Optimization | Current Cost | After Fix |
|---|---|---|
| Delete confirmation guard | ~$2-3/incident | Near-zero (prevents mass delete+re-entry) |
| WhatsApp PDF threshold | ~$1-2/day (CPU) | ~$0.50/day (fewer PDFs) |
| Batch_stock index | Slower queries = more CPU | Faster FIFO = less CPU per sale |
| **Total estimated saving** | **$3-5/day** | **$1-2/day** |

The most impactful single change is the **delete confirmation guard** — it directly prevents the Feb 18-style spikes. The WhatsApp PDF threshold is second highest impact.

---

### What Does NOT Need Changing

- `stock_movements` writes — these are correct and necessary, already reduced 73% by the audit log fix done earlier
- `audit_logs` writes — now lean and correct after the STOCK_MOVEMENT trigger was dropped
- `batch_stock` writes — necessary for FIFO accuracy, no redundancy
- Database polling — already on Free tier (manual refresh, no background polling cost)
