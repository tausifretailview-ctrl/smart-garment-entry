## Root Cause Found — Hivaa Collection Invoice Save Error

The "statement timeout" / save error was caused by **an infinite loop inside the `generate_custom_sale_number` Postgres function**, triggered by Hivaa's settings.

### What Hivaa's settings actually contain
- `invoice_numbering_format` = **NULL** (never set)
- `invoice_series_start` = `"INV/26-27/7"` (a literal string with **no `{###}` placeholder**)

### What the code does today
`src/utils/saleNumber.ts` falls back to using `invoice_series_start` as the **format** when `invoice_numbering_format` is missing:

```ts
const rawFormat = saleSettings?.invoice_numbering_format || saleSettings?.invoice_series_start;
```

So it calls the RPC with `p_format = "INV/26-27/7"` — a string with no `{###}` token.

### What the RPC does
Inside `generate_custom_sale_number`:
```sql
v_invoice_number := replace(v_invoice_number, '{###}', ...);  -- no-op, no placeholder
LOOP
  ... build v_invoice_number ...   -- always "INV/26-27/7" regardless of v_sequence
  EXIT WHEN NOT v_exists;          -- never exits once "INV/26-27/7" is in sales
  v_sequence := v_sequence + 1;
END LOOP;
```
Once `INV/26-27/7` is saved, every subsequent call loops forever → Postgres hits `statement_timeout` → the user sees the generic save error. That is exactly why changing the start-from value to a brand-new number temporarily "fixed" it (until the next save).

This also explains the historic duplicate rows for `INV/26-27/1` and `INV/26-27/2` in Hivaa's `sales` table — earlier saves hit the same loop with the old start value.

---

## Fix Plan

### 1. `src/utils/saleNumber.ts` — derive a real format from `series_start`
When only `invoice_series_start` / `pos_series_start` is provided (no explicit format string with a placeholder), convert the trailing digits into a `{###}` token so the RPC has something to increment:

```text
"INV/26-27/7"  →  format: "INV/26-27/{###}",  min_sequence: 7
"POS/26-27/11" →  format: "POS/26-27/{###}",  min_sequence: 11
```

If the user-supplied format already contains any `{#}`-style placeholder, leave it as-is. Apply the same conversion in both `sale` and `pos` branches.

### 2. `generate_custom_sale_number` + `generate_custom_pos_number` — defensive guards
Migration to harden both functions so a misconfigured format can never hang the database:

- Detect formats with **no number placeholder** (`{###}`, `{####}`, `{#####}`) and `RAISE EXCEPTION` with a clear message (`Numbering format must contain a {###} placeholder`).
- Add a hard iteration cap (e.g. 10,000) inside the `LOOP`; raise a descriptive exception if exceeded instead of running until statement_timeout.

### 3. Backfill Hivaa's settings (one-time data fix)
Update Hivaa Collection's `settings.sale_settings`:
- Set `invoice_numbering_format` = `"INV/{YY}-{YY+1}/{###}"`-equivalent literal `"INV/26-27/{###}"` (matches current format; FY auto-correct in `autoCorrectFY` already handles the year roll-over).
- Keep `invoice_series_start` = `"INV/26-27/8"` so the next saved invoice will be `INV/26-27/8` (since `7` already exists).

No other organization currently shows this exact issue, but the code + RPC fix protects every tenant from the same misconfiguration going forward.

### 4. Verification
- Re-save a sale invoice in Hivaa Collection → confirm number `INV/26-27/8` is generated without timeout.
- Save another → `INV/26-27/9`.
- Check the next POS bill increments cleanly from `POS/26-27/2`.

### Files touched
- `src/utils/saleNumber.ts` (placeholder derivation)
- New migration: harden `generate_custom_sale_number` & `generate_custom_pos_number`
- Data update on `settings` row for Hivaa Collection organization
