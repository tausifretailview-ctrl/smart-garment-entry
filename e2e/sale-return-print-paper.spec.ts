import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * BABJI ENTERPRISES (Nov 2026): a sale return of an invoice (INV/…) printed its A4 credit note
 * squeezed to receipt width. The paper comes from the original bill (invoice → Sale bill paper,
 * POS → POS paper), but the print ran with the page style of the render before the return was
 * chosen — the POS paper, here an 80mm roll.
 */
const ret = {
  id: "r1", organization_id: E2E_ORG_ID, return_number: "SR/26-27/41", return_date: "2026-11-26",
  created_at: "2026-11-26T09:19:00Z", customer_id: null, customer_name: "STEP IN VASHI", original_sale_number: "INV/26-27/309",
  gross_amount: 3324.4, gst_amount: 0, net_amount: 3324.4, refund_type: "credit_note", credit_status: "pending",
  credit_note_id: null, deleted_at: null, is_dc: false, notes: null,
};
const item = {
  id: "ri1", return_id: "r1", product_id: "p1", variant_id: "v1", product_name: "Shuffle Downtown", size: "6",
  color: "PUMA White-Evening Blue", quantity: 1, unit_price: 3324.4, gst_percent: 18, line_total: 3324.4, barcode: "40259616", deleted_at: null,
};

test("sale return of an invoice prints on A4, not on the POS roll", async ({ page, backend }) => {
  await page.addInitScript(() => {
    window.print = () => {
      const css = [...document.querySelectorAll("style")].map((s) => s.textContent || "").join("\n");
      const page = /@page\s*\{[^}]*size:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? null;
      const a4Note = !!document.querySelector(".credit-note-print");
      (window.top as unknown as { __printed?: unknown[] }).__printed ??= [];
      (window.top as unknown as { __printed: unknown[] }).__printed.push({ page, a4Note });
    };
  });
  // POS bills on an 80mm roll, invoices on A4 (wholesale size-wise template).
  backend.tables.settings[0].sale_settings = {
    pos_bill_format: "thermal",
    sales_bill_format: "a4",
    invoice_template: "wholesale-size-a4",
  };
  backend.addRows("sale_returns", [ret]).addRows("sale_return_items", [item]);

  await page.goto(`/${E2E_ORG_SLUG}/sale-returns`);
  const print = page.getByTitle("Print").filter({ visible: true }).first();
  await expect(print).toBeVisible({ timeout: 60_000 });
  await print.click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed?: unknown[] }).__printed?.length ?? 0), { timeout: 20_000 })
    .toBe(1);
  const [printed] = (await page.evaluate(() => (window as unknown as { __printed: unknown[] }).__printed)) as Array<{
    page: string | null;
    a4Note: boolean;
  }>;
  expect(printed.a4Note).toBe(true);
  expect(printed.page).toBe("A4 portrait");
});
