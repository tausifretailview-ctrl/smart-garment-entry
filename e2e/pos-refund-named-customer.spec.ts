import type { Page } from "@playwright/test";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, type MockBackend } from "./support/mockBackend";

/**
 * POS, named customer, sale return worth more than the bill (shop report: "refund option not
 * showing"). The footer showed "Refund due" while the amount was typed, then the amount was
 * cut to the bill and Mix Payment opened at ₹0 with nothing to refund and nothing to save.
 * Now POS asks, and a yes makes the rest a refund that Mix Payment offers.
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", deleted_at: null };
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 999, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};
const savedReturn = (amount: number) => ({
  id: "sr-1", organization_id: E2E_ORG_ID, customer_id: "cust-1", customer_name: "RAVI KUMAR",
  return_number: "SR/26-27/7", return_date: "2026-11-20", net_amount: amount, credit_available_balance: amount,
  credit_status: "pending", refund_type: "credit_note", linked_sale_id: null, credit_note_id: null, deleted_at: null,
});

/** A 999 bill for RAVI KUMAR, who has `credit` saved return credit. */
async function billFor(page: Page, backend: MockBackend, credit: number) {
  backend.addRows("customers", [customer]).addRows("products", [product]).addRows("product_variants", [variant]);
  if (credit > 0) backend.addRows("sale_returns", [savedReturn(credit)]);

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);

  await page.getByPlaceholder("Enter customer name or phone").filter({ visible: true }).fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  const sr = page.getByTestId("pos-sr-adjust").filter({ visible: true });
  if (credit > 0) await expect(page.getByText(`S/R Adj · CN ₹${credit.toLocaleString("en-IN")}`).filter({ visible: true })).toBeVisible();
  return { sr, prompt: page.getByTestId("pos-manual-sr-prompt") };
}

test("saved return credit above the bill: POS asks, then Mix Payment offers the refund", async ({ page, backend }) => {
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    const sale = args.p_sale as Record<string, unknown>;
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/1" }, items_inserted: 1, settled: true };
  });
  backend.onRpc("generate_voucher_number", () => "PAY/26-27/1");
  const { sr, prompt } = await billFor(page, backend, 2400);

  await sr.fill("2400");
  await sr.press("Tab");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Refund ₹1,401.00 to the customer?");
  await expect(prompt).toContainText("RAVI KUMAR has ₹2,400.00 saved return credit.");
  await expect(prompt).not.toContainText("old sale return");
  await prompt.getByRole("button", { name: "Refund ₹1,401.00" }).click();
  await expect(prompt).toBeHidden();
  await expect(sr).toHaveValue("2400");
  await expect(page.getByText(/Return ₹2400 · Applied ₹999 · Refund due ₹1401/).filter({ visible: true })).toBeVisible();

  await page.keyboard.press("F6");
  const mix = page.getByRole("dialog").filter({ hasText: "Refund Mode - Customer Refund Required" });
  await expect(mix).toBeVisible();
  await expect(mix.getByRole("button", { name: "Process Refund" })).toBeEnabled();
  await expect(mix.getByRole("button", { name: "Issue C/Note" })).toBeEnabled();
  await expect(mix.locator("#refund")).toHaveValue("1401");
  // Nothing was written just for asking.
  expect(backend.calls.filter((c) => c.kind === "insert" && c.name === "sale_returns")).toEqual([]);

  // Process Refund (cash): the bill is saved at its own amount, ₹999 of the credit settles it,
  // and the ₹1,401 goes out as a cash refund voucher.
  await mix.getByRole("button", { name: "Process Refund" }).click();
  await expect.poll(() => backend.rpcCalls("save_sale_with_items_numbered").length).toBe(1);
  const { p_sale } = backend.rpcCalls("save_sale_with_items_numbered")[0] as { p_sale: Record<string, unknown> };
  expect(p_sale).toMatchObject({ customer_id: "cust-1", gross_amount: 999, net_amount: 999, refund_amount: 1401, payment_method: "multiple" });
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "voucher_entries").length)
    .toBe(1);
  const refund = backend.calls.find((c) => c.kind === "insert" && c.name === "voucher_entries")!.body;
  expect(refund).toMatchObject({
    voucher_type: "payment",
    reference_type: "customer",
    reference_id: "cust-1",
    total_amount: 1401,
    payment_method: "cash",
    client_request_id: "pos-exchange-refund:sale-1",
  });
  await expect.poll(() => backend.rpcCalls("apply_pos_credit_fifo").length).toBe(1);
  expect(backend.rpcCalls("apply_pos_credit_fifo")[0]).toMatchObject({ p_sale_id: "sale-1", p_customer_id: "cust-1", p_amount: 999 });
});

test("declining the refund keeps only the bill amount, and Mix Payment does not open at ₹0", async ({ page, backend }) => {
  const { sr, prompt } = await billFor(page, backend, 2400);

  await sr.fill("2400");
  await sr.press("Tab");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "No, use ₹999.00 only" }).click();
  await expect(prompt).toBeHidden();
  await expect(sr).toHaveValue("999");

  // The bill is fully covered: Mix Payment would have nothing to split.
  await page.keyboard.press("F6");
  await expect(page.getByText("Nothing to collect on this bill").first()).toBeVisible();
  await expect(page.getByRole("dialog").filter({ hasText: "Mix Payment" })).toHaveCount(0);
});

test("paying straight from the box (no blur) asks the same question", async ({ page, backend }) => {
  const { sr, prompt } = await billFor(page, backend, 2400);

  await sr.fill("2400");
  await page.keyboard.press("F6"); // focus is still in the S/R box
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Refund ₹1,401.00 to the customer?");
  await expect(page.getByRole("dialog").filter({ hasText: /Mix Payment|Refund Mode/ })).toHaveCount(0);
});

test("amount no saved return covers (another shop's return): recorded, then refunded in cash with F1", async ({ page, backend }) => {
  backend.keepInserts("sale_returns", "credit_notes");
  backend.onRpc("generate_sale_return_number", () => "SR/26-27/9");
  backend.onRpc("generate_credit_note_number", () => "CN/26-27/9");
  backend.onRpc("generate_voucher_number", () => "PAY/26-27/1");
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    const sale = args.p_sale as Record<string, unknown>;
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/1" }, items_inserted: 1, settled: true };
  });
  // The shop's photo, scaled to this bill: saved credit covers the bill only, the rest is typed.
  const { sr, prompt } = await billFor(page, backend, 999);

  await sr.fill("2400");
  await sr.press("Tab");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Refund ₹1,401.00 to the customer?");
  await expect(prompt).toContainText("₹1,401.00 is not covered by a saved return and will be recorded as an old sale return");
  await prompt.getByRole("button", { name: "Record & refund" }).click();
  await expect(prompt).toBeHidden();

  // The uncovered part is now a sale return (amount only) with its credit note, for this customer.
  const recorded = backend.calls.filter((c) => c.kind === "insert" && c.name === "sale_returns");
  expect(recorded).toHaveLength(1);
  expect(recorded[0].body).toMatchObject({ customer_id: "cust-1", net_amount: 1401, refund_type: "credit_note", credit_status: "pending" });
  const creditNote = backend.calls.filter((c) => c.kind === "insert" && c.name === "credit_notes");
  expect(creditNote).toHaveLength(1);
  expect(creditNote[0].body).toMatchObject({ customer_id: "cust-1", credit_amount: 1401, credit_note_number: "CN/26-27/9" });
  expect(backend.calls.filter((c) => c.kind === "delete" && c.name === "sale_returns")).toEqual([]);

  // The whole ₹2,400 is on the bill and backed: ₹999 settles it, ₹1,401 is due back.
  await expect(sr).toHaveValue("2400");
  await expect(page.getByText("S/R Adj · CN ₹2,400").filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/Return ₹2400 · Applied ₹999 · Refund due ₹1401/).filter({ visible: true })).toBeVisible();

  // Cash (F1) saves the bill and pays the refund in cash.
  await page.keyboard.press("F1");
  await expect.poll(() => backend.rpcCalls("save_sale_with_items_numbered").length).toBe(1);
  const { p_sale } = backend.rpcCalls("save_sale_with_items_numbered")[0] as { p_sale: Record<string, unknown> };
  expect(p_sale).toMatchObject({ customer_id: "cust-1", gross_amount: 999, net_amount: 999, refund_amount: 1401 });
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "voucher_entries").length)
    .toBe(1);
  expect(backend.calls.find((c) => c.kind === "insert" && c.name === "voucher_entries")!.body).toMatchObject({
    voucher_type: "payment",
    reference_type: "customer",
    reference_id: "cust-1",
    total_amount: 1401,
    payment_method: "cash",
  });
  await expect.poll(() => backend.rpcCalls("apply_pos_credit_fifo").length).toBe(1);
  expect(backend.rpcCalls("apply_pos_credit_fifo")[0]).toMatchObject({ p_customer_id: "cust-1", p_amount: 999 });
});

test("recording the uncovered amount fails: nothing is refunded", async ({ page, backend }) => {
  // The return is not kept here, so its credit note cannot be made and the recording is undone.
  backend.onRpc("generate_sale_return_number", () => "SR/26-27/9");
  const { sr, prompt } = await billFor(page, backend, 999);

  await sr.fill("2400");
  await sr.press("Tab");
  await prompt.getByRole("button", { name: "Record & refund" }).click();
  await expect(prompt).toBeHidden();

  await expect(page.getByText("Could not record the old sale return").first()).toBeVisible();
  expect(backend.calls.filter((c) => c.kind === "delete" && c.name === "sale_returns")).toHaveLength(1);
  await expect(sr).toHaveValue("999");
  await page.keyboard.press("F6");
  await expect(page.getByRole("dialog").filter({ hasText: /Refund Mode/ })).toHaveCount(0);
});

test("walk-in bill: a typed return above the bill is refunded in cash with F1, no question asked", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    const sale = args.p_sale as Record<string, unknown>;
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/1" }, items_inserted: 1, settled: true };
  });
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);

  const sr = page.getByTestId("pos-sr-adjust").filter({ visible: true });
  await sr.fill("2400");
  await sr.press("Tab");
  await expect(page.getByTestId("pos-manual-sr-prompt")).toHaveCount(0);
  await expect(sr).toHaveValue("2400");
  await expect(page.getByText(/Return ₹2400 · Applied ₹999 · Refund due ₹1401/).filter({ visible: true })).toBeVisible();

  await page.keyboard.press("F1");
  await expect.poll(() => backend.rpcCalls("save_sale_with_items_numbered").length).toBe(1);
  const { p_sale } = backend.rpcCalls("save_sale_with_items_numbered")[0] as { p_sale: Record<string, unknown> };
  expect(p_sale).toMatchObject({ gross_amount: 999, refund_amount: 1401 });
});
