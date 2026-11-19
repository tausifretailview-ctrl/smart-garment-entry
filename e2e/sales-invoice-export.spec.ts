import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/** Sale Bill bottom bar: Excel and PDF export the bill on screen (user request). */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 1000, mrp: 1000, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

test("Sale Bill exports the bill to Excel and PDF from the bottom bar", async ({ page, backend }, testInfo) => {
  backend.addRows("customers", [customer]).addRows("products", [product]).addRows("product_variants", [variant]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  const footer = page.locator("footer.entry-page-footer");
  const excel = footer.getByRole("button", { name: "Excel", exact: true });
  const pdf = footer.getByRole("button", { name: "PDF", exact: true });
  await expect(excel).toBeDisabled();
  await expect(pdf).toBeDisabled();

  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);
  await expect(excel).toBeEnabled();

  const [xlsxDl] = await Promise.all([page.waitForEvent("download"), excel.click()]);
  expect(xlsxDl.suggestedFilename()).toMatch(/^Invoice_DRAFT_\d{8}\.xlsx$/);
  const xlsxPath = testInfo.outputPath("bill.xlsx");
  await xlsxDl.saveAs(xlsxPath);
  const wb = XLSX.read(readFileSync(xlsxPath));
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Invoice, { header: 1 });
  expect(rows[1][0]).toContain("DRAFT");
  expect(rows).toContainEqual(["Customer", "RAVI KUMAR"]);
  expect(rows.some((r) => String(r[1]).startsWith("COTTON SHIRT") && r[4] === "100001" && r[6] === 1 && r[11] === 1000)).toBe(true);
  expect(rows.some((r) => r[10] === "Net Payable" && r[11] === 1000)).toBe(true);

  const [pdfDl] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), pdf.click()]);
  expect(pdfDl.suggestedFilename()).toMatch(/^Invoice_DRAFT_\d{8}\.pdf$/);
  const pdfPath = testInfo.outputPath("bill.pdf");
  await pdfDl.saveAs(pdfPath);
  const bytes = readFileSync(pdfPath);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(10_000);
  // The bill stays as it was (export renders a copy, it does not save or clear anything).
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);
  await expect(excel).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("export-bar.png") });
});
