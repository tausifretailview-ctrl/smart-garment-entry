import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Core flow 2 of 6 (Plan Phase 4, R2): Purchase Entry with one line (restored from the
 * draft the screen keeps in sessionStorage), pick the supplier, type the supplier's invoice
 * number, Save Bill. The bill goes to the database as ONE
 * save_purchase_bill_with_items_atomic call, and "Bill Saved Successfully" opens.
 */

const supplier = { id: "sup-1", organization_id: E2E_ORG_ID, supplier_name: "ACME TEXTILES", deleted_at: null };

const line = {
  temp_id: "t1",
  product_id: "p1",
  sku_id: "v1",
  product_name: "COTTON SHIRT",
  size: "M",
  qty: 2,
  pur_price: 250,
  sale_price: 499,
  mrp: 599,
  gst_per: 5,
  hsn_code: "6205",
  barcode: "100001",
  discount_percent: 0,
  line_total: 500,
  color: "BLUE",
};

test("Purchase: one line, supplier and invoice no, Save Bill", async ({ page, backend }) => {
  backend.addRows("suppliers", [supplier]);
  backend.onRpc("save_purchase_bill_with_items_atomic", (args) => ({
    ...(args.p_bill as Record<string, unknown>),
    id: "bill-1",
    software_bill_no: "PUR/26-27/1",
    organization_id: E2E_ORG_ID,
  }));

  await page.addInitScript(
    ({ key, draft }) => {
      if (sessionStorage.getItem("__e2e_seeded")) return; // seed once; the screen rewrites it
      sessionStorage.setItem("__e2e_seeded", "1");
      sessionStorage.setItem(key, JSON.stringify(draft));
    },
    {
      key: `purchaseEntryState:${E2E_ORG_ID}:${E2E_USER_ID}`,
      draft: {
        lineItems: [line],
        billData: { supplier_id: "", supplier_name: "", supplier_invoice_no: "" },
        entryMode: "inline",
        savedAt: Date.now(),
      },
    },
  );

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  const row = page.locator("tr.purchase-bill-line-row");
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  await expect(row).toContainText("COTTON SHIRT");
  await expect(row).toContainText("₹500.00");

  await page.locator("#supplier_name").click();
  await page.getByRole("option", { name: "ACME TEXTILES" }).click();
  await expect(page.locator("#supplier_name")).toContainText("ACME TEXTILES");
  await page.locator("#supplier_invoice_no").fill("INV-77");

  await page.locator("footer.entry-page-footer").getByRole("button", { name: /Save Bill/ }).click();

  const saved = page.getByRole("dialog", { name: /Bill Saved Successfully/ });
  await expect(saved).toBeVisible();

  const saves = backend.rpcCalls("save_purchase_bill_with_items_atomic");
  expect(saves).toHaveLength(1);
  const { p_organization_id, p_bill, p_items } = saves[0] as {
    p_organization_id: string;
    p_bill: Record<string, unknown>;
    p_items: Record<string, unknown>[];
  };
  expect(p_organization_id).toBe(E2E_ORG_ID);
  expect(p_bill).toMatchObject({
    supplier_id: "sup-1",
    supplier_name: "ACME TEXTILES",
    supplier_invoice_no: "INV-77",
    gross_amount: 500,
    is_dc_purchase: false,
  });
  expect(Number(p_bill.net_amount)).toBe(525); // 500 + 5% GST
  expect(p_items).toHaveLength(1);
  expect(p_items[0]).toMatchObject({ product_id: "p1", sku_id: "v1", barcode: "100001", qty: 2, pur_price: 250, line_total: 500 });

  // The old step-by-step insert path must not run as well.
  expect(backend.calls.filter((c) => c.kind === "insert" && (c.name === "purchase_bills" || c.name === "purchase_items"))).toEqual([]);
});
