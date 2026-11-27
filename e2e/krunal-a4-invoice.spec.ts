import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Krunal A4 (Nov 2026): the KRUNAL ENTERPRISES bill-book layout on A4, printed as ORIGINAL FOR
 * RECIPIENT and DUPLICATE FOR SUPPLIER. Every page repeats the shop header and Bill To / Ship To;
 * page 2 is not a bare continuation. PDFs carry the original copy only.
 */
const customer = {
  id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "ARHAM CREATION", phone: "9898989898",
  address: "SHOP 12, MAIN BAZAR, SURAT 395003", gst_number: "24ABCDE1234F1Z5", opening_balance: 0, deleted_at: null,
};
const items = Array.from({ length: 30 }, (_, i) => ({
  id: `si-${i}`, sale_id: "sale-9", product_id: "p1", variant_id: `v${i}`, product_name: `KIDZELLO ${1860 + i}`,
  size: "12-30", color: "OLIVE", barcode: `30${String(i).padStart(4, "0")}`, quantity: 4, unit_price: 1595, mrp: 1595,
  discount_percent: 43, gst_percent: 5, line_total: 3818.43, hsn_code: "620319", discount_share: 0, deleted_at: null,
}));
const total = Math.round(3818.43 * 30 * 100) / 100;
const sale = {
  id: "sale-9", organization_id: E2E_ORG_ID, sale_number: "KE/26-27/1317", sale_type: "invoice",
  sale_date: new Date().toISOString(), created_at: new Date().toISOString(), customer_id: "cust-1",
  customer_name: "ARHAM CREATION", customer_phone: "9898989898", customer_address: "SHOP 12, MAIN BAZAR, SURAT 395003",
  shipping_address: "GODOWN 4, RING ROAD, SURAT 395002", gross_amount: total, discount_amount: 0, flat_discount_amount: 0,
  flat_discount_percent: 0, other_charges: 0, round_off: Math.round((Math.round(total) - total) * 100) / 100,
  net_amount: Math.round(total), paid_amount: 0, payment_status: "pending", payment_method: "pay_later",
  delivery_status: "undelivered", total_qty: 120, sale_return_adjust: 0, credit_applied: 0, is_cancelled: false,
  deleted_at: null, sale_items: items, customers: { gst_number: "24ABCDE1234F1Z5" },
};

test("Krunal A4: two copies, every page with header and Ship To, totals on the last page", async ({ page, backend }) => {
  await page.addInitScript(() => {
    window.print = () => {
      const q = (sel: string) => [...document.querySelectorAll(sel)].map((n) => (n.textContent || "").replace(/\s+/g, " ").trim());
      const pages = [...document.querySelectorAll(".krunal-a4-page")];
      (window.top as unknown as { __printed?: unknown[] }).__printed ??= [];
      (window.top as unknown as { __printed: unknown[] }).__printed.push({
        pages: pages.length,
        labels: q('[data-testid="krunal-copy-label"]').filter((_, i) => pages.length > 0 && i < pages.length + 1),
        pageNos: q('[data-testid="krunal-page-no"]'),
        shipTo: q('[data-testid="krunal-ship-to"]'),
        invoiceNos: q('[data-testid="krunal-invoice-no"]'),
        grandTotals: q('[data-testid="krunal-grand-total"]'),
        pdfSkipped: pages.filter((p) => (p as HTMLElement).dataset.pdfSkip === "true").length,
        rowsPerPage: pages.map((p) => p.querySelectorAll("tbody tr").length),
      });
    };
  });
  backend.tables.settings[0].sale_settings = { sales_bill_format: "a4", invoice_template: "krunal-a4" };
  backend.addRows("customers", [customer]).addRows("sales", [sale]).addRows("sale_items", items);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const row = page.locator("tr", { hasText: "KE/26-27/1317" }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByTitle("Print Invoice").click();
  // Invoice preview (default on) → Print.
  const preview = page.getByRole("dialog").filter({ hasText: "ORIGINAL FOR RECIPIENT" });
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await preview.getByRole("button", { name: /^Print/ }).first().click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed?: unknown[] }).__printed?.length ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  const [printed] = (await page.evaluate(() => (window as unknown as { __printed: unknown[] }).__printed)) as Array<{
    pages: number; labels: string[]; pageNos: string[]; shipTo: string[]; invoiceNos: string[]; grandTotals: string[];
    pdfSkipped: number; rowsPerPage: number[];
  }>;

  // 30 lines need two sheets; the whole set prints twice.
  expect(printed.pages).toBe(4);
  expect(printed.pdfSkipped).toBe(2);
  expect(printed.labels.slice(0, 4)).toEqual([
    "ORIGINAL FOR RECIPIENT", "ORIGINAL FOR RECIPIENT", "DUPLICATE FOR SUPPLIER", "DUPLICATE FOR SUPPLIER",
  ]);
  expect(printed.pageNos).toEqual(["Continued.. Page 1 Of 2", "Page 2 Of 2", "Continued.. Page 1 Of 2", "Page 2 Of 2"]);
  // Header and Ship To on every page, page 2 included.
  expect(printed.invoiceNos).toHaveLength(4);
  expect(printed.invoiceNos.every((t) => t.includes("KE/26-27/1317"))).toBe(true);
  expect(printed.shipTo).toHaveLength(4);
  expect(printed.shipTo.every((t) => t.includes("GODOWN 4, RING ROAD, SURAT 395002"))).toBe(true);
  // Totals close the last page of each copy only.
  expect(printed.grandTotals).toHaveLength(2);
  expect(printed.grandTotals[0]).toBe(Math.round(total).toLocaleString("en-IN", { minimumFractionDigits: 2 }));
});
