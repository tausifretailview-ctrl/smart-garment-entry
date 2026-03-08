

## Plan: Create Centralized `useSettings` Hook

### What We're Building
A single shared hook (`src/hooks/useSettings.ts`) that fetches organization settings once and caches them, replacing duplicated settings queries across the codebase. Two high-traffic pages (POSSales, SalesInvoice) will be updated to use it first.

### Current State
- **27+ files** each independently query the `settings` table with different query keys (`'settings'`, `'pos-settings'`, `'settings-upi'`, `'points-settings'`, etc.) and different column selections.
- This causes redundant database calls for the same data.

### Implementation Steps

**Step 1: Create `src/hooks/useSettings.ts`**
- `useSettings()` — core hook using `queryKey: ['org-settings', orgId]`, fetches `select('*')`, `staleTime: 5min`, `enabled: !!orgId`
- `usePOSSettings()` — returns `data?.sale_settings || {}`
- `useGSTSettings()` — returns `{ gstNumber, businessName }`
- `useInvoiceSettings()` — returns `data?.sale_settings` (invoice config lives in `sale_settings`)
- `useBillBarcodeSettings()` — returns `data?.bill_barcode_settings || {}`
- `useBusinessInfo()` — returns `{ businessName, address, mobileNumber, emailId, gstNumber }`

**Step 2: Update `src/pages/POSSales.tsx`**
- Replace the inline `useQuery` with `queryKey: ['pos-settings', ...]` (lines ~434-448) with `useSettings()`
- Keep all downstream usage of `settingsData` unchanged (the hook returns the same shape)

**Step 3: Update `src/pages/SalesInvoice.tsx`**
- Replace the inline `useQuery` with `queryKey: ['settings', ...]` (lines ~373-390) with `useSettings()`
- Already uses `staleTime: 300000` and `select(specific columns)` — the new hook fetches `*` which is a superset

### Technical Notes
- Both pages currently select different column sets but cast to `any` anyway — fetching `*` is safe and simplifies the hook.
- SalesInvoice already uses `staleTime: 300000` (5min), matching the new hook.
- POSSales doesn't set `staleTime`, so it will benefit from the 5-minute cache.
- No database migration needed — this is a frontend-only refactor.

