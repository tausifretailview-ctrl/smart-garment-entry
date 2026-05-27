# Fix build errors

Targeted, minimal fixes — only what's needed to clear TypeScript errors.

## 1. `src/pages/AdvanceBookingDashboard.tsx`
Add missing imports near the existing accounting/supabase imports:
```ts
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { deleteJournalEntryByReference } from "@/utils/accounting/journalService";
```

## 2. `src/pages/POSDashboard.tsx` (5 sites: lines 2236, 2318, 2365, 2378, 2390)
shadcn `<Select>` doesn't accept `className`. Each occurrence is already wrapped in a `w-full` div, so just drop the prop:
```tsx
<Select value={...} onValueChange={...} className="w-full">
// →
<Select value={...} onValueChange={...}>
```

## 3. `src/pages/PublicInvoiceView.tsx` (line 223)
`notes` is set twice in the `templateProps` literal (line 195 and 223). Remove the duplicate at line 223 (keep the earlier one — both have identical `sale.notes || ""`).

## 4. `src/utils/advanceRefundService.ts` (lines 328, 334)
The `select(select + join)` with a runtime-built string makes Supabase's type parser return `GenericStringError[]`. Cast through `unknown`:
```ts
return ((ext.data || []) as unknown) as Record<string, unknown>[];
// and
return ((leg.data || []) as unknown) as Record<string, unknown>[];
```

## 5. `src/utils/customerSegments.ts` (lines 160, 231)
Same root cause — conditional select string yields a `ParserError`. Cast through `unknown`:
```ts
allRows.push(...((data as unknown) as SaleRow[]));
// and
for (const row of (data as unknown) as SaleRow[]) {
```

## After fixes
Confirm the build is green, then I'll return to the supplier-payment-discount PR #7 sync question (PR is merged on GitHub but the commit isn't in this Lovable workspace — most likely a pending GitHub→Lovable sync).
