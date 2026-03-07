

## Fix: Sales Invoice Edit Navigation from Dashboard (404 Error)

### Problem
The Sales Invoice Dashboard navigates to `/sales-invoice/${invoice.id}` (e.g., `/sales-invoice/e60e78eb-...`) when editing, but there is no route defined for `sales-invoice/:id` in App.tsx. The route only matches `sales-invoice` (exact). This causes a 404 error.

Additionally, the SalesInvoice component expects edit data via `location.state.invoiceData`, but the dashboard navigate call doesn't pass any state.

The same issue applies to "Duplicate Invoice" which navigates to `/sales-invoice/new?duplicate=${invoice.id}`.

### Fix

**Option A (Recommended): Fix the navigation calls in SalesInvoiceDashboard.tsx**

Change the Edit Invoice navigate call from:
```typescript
navigate(`/sales-invoice/${invoice.id}`)
```
to:
```typescript
navigate('/sales-invoice', { state: { editInvoiceId: invoice.id, invoiceData: invoice } })
```

This matches how SalesInvoice.tsx already expects data (via `location.state`). The `loadInvoiceById` function already exists in SalesInvoice to fetch full invoice details.

Also fix:
- "Duplicate Invoice" navigation to pass state instead of URL path
- "New Invoice" navigation similarly

**Option B: Add a route parameter + useParams in SalesInvoice**

Add `sales-invoice/:invoiceId` route in App.tsx and handle `useParams` in SalesInvoice.tsx. This is more work and the component already has the `loadInvoiceById` mechanism via location state.

### Files to Modify
- `src/pages/SalesInvoiceDashboard.tsx` — Fix all `navigate('/sales-invoice/...')` calls to use `navigate('/sales-invoice', { state: {...} })` pattern

