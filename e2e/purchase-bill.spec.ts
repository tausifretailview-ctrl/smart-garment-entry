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

/**
 * After the bill is saved, the follow-up writes (challan flag, "user cancelled" flag, prices,
 * colours, product details) used to run one after another: a median 2.3 s of a 7 s purchase
 * save (app timing, Nov 2026). Writes that touch different rows now go out together: while
 * the products write is held for 1.5 s, the variant writes and the product read still go out.
 */
test("Purchase save: follow-up writes after the bill run side by side", async ({ page, backend }) => {
  backend.addRows("suppliers", [supplier]);
  backend.onRpc("save_purchase_bill_with_items_atomic", (args) => ({
    ...(args.p_bill as Record<string, unknown>),
    id: "bill-2",
    software_bill_no: "PUR/26-27/2",
    organization_id: E2E_ORG_ID,
  }));

  await page.addInitScript(
    ({ key, draft }) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
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

  // Hold the "user cancelled" write (products PATCH) for 1.5 s; record when each write starts.
  const started: Array<{ what: string; at: number }> = [];
  let heldUntil = 0;
  await page.route("**/rest/v1/products?**", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      started.push({ what: "products-update", at: Date.now() });
      heldUntil = Date.now() + 1500;
      await new Promise((r) => setTimeout(r, 1500));
    } else if (method === "GET" && route.request().url().includes("select=id%2Cbrand%2Ccolor%2Cstyle")) {
      started.push({ what: "products-details-read", at: Date.now() });
    }
    await route.fallback();
  });
  await page.route("**/rest/v1/product_variants?**", async (route) => {
    if (route.request().method() === "PATCH") started.push({ what: "variants-update", at: Date.now() });
    await route.fallback();
  });

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await expect(page.locator("tr.purchase-bill-line-row")).toHaveCount(1, { timeout: 60_000 });
  await page.locator("#supplier_name").click();
  await page.getByRole("option", { name: "ACME TEXTILES" }).click();
  await page.locator("#supplier_invoice_no").fill("INV-78");
  await page.locator("footer.entry-page-footer").getByRole("button", { name: /Save Bill/ }).click();

  await expect(page.getByRole("dialog", { name: /Bill Saved Successfully/ })).toBeVisible({ timeout: 15_000 });

  const held = started.find((s) => s.what === "products-update");
  expect(held, "the user-cancelled flag is cleared").toBeTruthy();
  const variantWrite = started.find((s) => s.what === "variants-update");
  const detailsRead = started.find((s) => s.what === "products-details-read");
  expect(variantWrite, "the challan flag is written").toBeTruthy();
  expect(detailsRead, "product details are read for the labels").toBeTruthy();
  expect(variantWrite!.at).toBeLessThan(heldUntil);
  // The product read went out while the products write was still held (it used to wait for it).
  expect(detailsRead!.at).toBeLessThan(heldUntil);
});

/**
 * User's choice (Nov 2026): a price changed here is not copied to a shop that already received
 * the item by Stock Transfer, so after the save a warning names the item, the shop and both prices.
 */
test("Purchase save: warns when another shop still sells a transferred item at the old price", async ({ page, backend }) => {
  backend.addRows("suppliers", [supplier]);
  backend.onRpc("save_purchase_bill_with_items_atomic", (args) => ({
    ...(args.p_bill as Record<string, unknown>),
    id: "bill-3",
    software_bill_no: "PUR/26-27/3",
    organization_id: E2E_ORG_ID,
  }));
  backend.onRpc("get_transferred_price_gaps", () => [
    {
      variant_id: "v1", barcode: "100001", product_name: "COTTON SHIRT", size: "M", sender_sale_price: 499,
      to_shop: "BRANCH SHOP", receiver_sale_price: 449, receiver_stock: 3, transfer_number: "ST/0007",
      accepted_at: "2026-11-24T07:41:44Z",
    },
  ]);

  await page.addInitScript(
    ({ key, draft }) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
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
  await expect(page.locator("tr.purchase-bill-line-row")).toHaveCount(1, { timeout: 60_000 });
  await page.locator("#supplier_name").click();
  await page.getByRole("option", { name: "ACME TEXTILES" }).click();
  await page.locator("#supplier_invoice_no").fill("INV-79");
  await page.locator("footer.entry-page-footer").getByRole("button", { name: /Save Bill/ }).click();

  await expect(page.getByRole("dialog", { name: /Bill Saved Successfully/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 item(s) were sent to BRANCH SHOP at the old price")).toBeVisible();
  await expect(page.getByText(/COTTON SHIRT M \(100001\): BRANCH SHOP sells at ₹449, here ₹499/)).toBeVisible();
  expect(backend.rpcCalls("get_transferred_price_gaps")[0]).toMatchObject({ p_org_id: E2E_ORG_ID, p_variant_ids: ["v1"] });
});
