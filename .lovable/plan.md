

## Root cause

`sales.sale_date` is a **timestamp** column. The Net Profit page queries it with:

```ts
.gte("sale_date", fromDate)   // "2026-04-18"
.lte("sale_date", toDate)     // "2026-04-18"  ← interpreted as 00:00:00
```

When user picks **Today**, both `fromDate` and `toDate` become `"2026-04-18"`. Postgres treats the upper bound as `2026-04-18 00:00:00`, so every sale created today (after midnight) is **excluded** → empty result → blank report.

This bug affects **all presets** in `NetProfitAnalysis.tsx` (Today, Week, Month, Quarter, FY) — anything with sales on the end date is silently dropped. Other dashboards (e.g. `SalesInvoiceDashboard`) avoid this by appending `'T23:59:59'` to the end bound.

## Fix

### 1. `src/pages/NetProfitAnalysis.tsx` — extend `toDate` to end-of-day when querying

In both `fetchSupplierWiseProfit` (line 157) and `fetchProductWiseProfit` (line 283), change:

```ts
.lte("sale_date", toDate)
```

to:

```ts
.lte("sale_date", `${toDate}T23:59:59`)
```

Keep `gte("sale_date", fromDate)` as-is (start-of-day is correct for date-only string).

### 2. Empty-state UX (small but useful)

After Generate runs and result is empty, currently the page shows nothing. Add a friendly empty row in both tables ("No sales found in the selected period") so the user knows the query succeeded and the date range simply has no data — instead of a blank page that looks broken.

That's it — two query lines + one empty-state message. No schema, no RLS, no other reports touched.

## Files touched
- `src/pages/NetProfitAnalysis.tsx` — fix `lte` upper bound (2 places); add empty-state row in supplier and product tables.

## Acceptance
- Dashboard → Today → Net Profit → Generate now shows today's sales with COGS and profit.
- Week / Month / Quarter / FY presets all include sales on the final date.
- When a date range genuinely has no sales, the table shows "No data" instead of going blank.

