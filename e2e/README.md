# Browser tests (Plan Phase 4, R2)

End-to-end tests for the core flows, run with Playwright against the real app in Chromium.

```bash
npm run test:e2e          # starts its own Vite server on port 8091
npx playwright test --ui  # pick and watch a test
```

First run on a new machine: `npx playwright install chromium`.

## No live database

The test server starts with `VITE_SUPABASE_URL=https://e2e-mock.supabase.invalid`
(`playwright.config.ts`), so the app does not know the production URL. `e2e/support/mockBackend.ts`
answers every request to that address from in-memory tables and aborts requests to any other host.
After each test the `backend` fixture fails the test if anything tried to reach a real Supabase.
Never point these tests at production; they need no credentials.

## Writing a test

```ts
import { test, expect } from "./support/test";

test("…", async ({ page, backend }) => {
  backend.addRows("product_variants", [/* rows the screen reads */]);
  backend.onRpc("save_sale_with_items_numbered", (args) => ({ /* what the database would return */ }));
  await page.goto("/demo/pos-sales"); // signed in as the e2e cashier of org "demo"
  // … drive the screen, then check the UI and backend.rpcCalls(...) / backend.calls
});
```

`backend.calls` records every insert / update / upsert / delete, RPC and edge-function call in
order. Selects understand `col=eq.value` filters; other filters return the whole table.

## Core flows

| # | Flow | Spec |
|---|------|------|
| 1 | POS: scan, save with Cash, bill number | `pos-cash-bill.spec.ts` |
| 2 | Purchase: draft line, supplier, invoice no, Save Bill | `purchase-bill.spec.ts` |
| 3 | POS Sale Return (F5): customer, scan, Credit Note, save | `sale-return-credit-note.spec.ts` |
| 4 | Sales invoice save | to do |
| 5 | Barcode label print | to do |
| 6 | Customer payment receipt | to do |
