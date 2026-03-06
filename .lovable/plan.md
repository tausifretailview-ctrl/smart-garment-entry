

## Plan: Add Print Button and Invoice Navigation to Sales Invoice Page

### What the user wants
1. A **Print** button in the Sales Invoice form to print the current invoice (without needing to save first — for already-saved/editing invoices)
2. **Last Invoice**, **Previous**, **Next** navigation buttons (like POS) after the "Back to Sales Dashboard" button
3. First click on "Last Invoice" loads the most recent saved invoice, then Previous/Next navigate between invoices

### Implementation (single file: `src/pages/SalesInvoice.tsx`)

**1. Add state for invoice navigation**
- `allInvoices` — query to fetch recent sale invoices (id, sale_number, sale_date) ordered by `created_at DESC`, limited to recent 500
- `currentInvoiceIndex` — tracks position in the list
- Reuse the existing `loadInvoiceForEdit` pattern (same as `location.state?.invoiceData` flow) but fetch full invoice data on-demand

**2. Add navigation functions**
- `handleLastInvoice()` — loads the latest invoice (index 0), fetches full invoice data with items and populates the form (same as editing from dashboard)
- `handlePreviousInvoice()` — goes to older invoice (higher index)
- `handleNextInvoice()` — goes to newer invoice (lower index)
- `loadInvoiceById(saleId)` — fetches sale + sale_items from DB, sets `editingInvoiceId`, populates all form fields and `savedInvoiceData` for printing

**3. Add Print button for editing mode**
- When `editingInvoiceId` is set (viewing an existing invoice), show a Print button in the sticky action bar
- This calls the existing `handlePrintInvoice()` function
- Need to populate `savedInvoiceData` when loading an invoice for navigation (not just on save)

**4. Add navigation UI below BackToDashboard**
- After the "Back to Sales Dashboard" button, add a row with: `Last Invoice` | `< Previous` | `position X of Y` | `Next >` buttons
- Style similar to POS bottom bar navigation
- Show the invoice number preview on Previous/Next buttons

**5. Query for invoice list**
```typescript
const { data: allInvoices } = useQuery({
  queryKey: ['all-sale-invoices', currentOrganization?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('sales')
      .select('id, sale_number, created_at')
      .eq('organization_id', currentOrganization.id)
      .eq('sale_type', 'invoice')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    return data || [];
  },
  enabled: !!currentOrganization?.id,
});
```

**6. Load invoice function** — fetches full sale + sale_items, populates form fields (reusing the same pattern as `location.state?.invoiceData`), and sets `savedInvoiceData` so the Print button works immediately.

### Files to modify
- `src/pages/SalesInvoice.tsx` — Add query, navigation state, navigation handlers, Print button, navigation UI bar

