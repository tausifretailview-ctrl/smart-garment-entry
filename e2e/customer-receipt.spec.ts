import { test, expect } from "./support/test";
import type { MockBackend } from "./support/mockBackend";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Core flow 6 of 6 (Plan Phase 4, R2): customer payment receipt from POS → Payments →
 * Customer Receipt. RAVI KUMAR owes ₹999 on INV/26-27/1: pick him, tick the invoice, Record
 * Payment (cash). One receipt voucher is written against the invoice, the database settles
 * the invoice, and the Payment Receipt shows ₹999 received and ₹0 left. Paying more than
 * is owed cannot be recorded (button disabled) and nothing is written.
 */

const customer = {
  id: "cust-1",
  organization_id: E2E_ORG_ID,
  customer_name: "RAVI KUMAR",
  phone: "9876543210",
  opening_balance: 0,
  deleted_at: null,
};
const invoice = {
  id: "sale-1",
  organization_id: E2E_ORG_ID,
  sale_number: "INV/26-27/1",
  sale_date: "2026-11-10",
  sale_type: "invoice",
  net_amount: 999,
  paid_amount: 0,
  sale_return_adjust: 0,
  payment_status: "pending",
  payment_method: "pay_later",
  cash_amount: 0,
  card_amount: 0,
  upi_amount: 0,
  customer_id: "cust-1",
  customer_name: "RAVI KUMAR",
  customer_phone: "9876543210",
  customer_address: null,
  is_cancelled: false,
  deleted_at: null,
};

function owes999(backend: MockBackend) {
  backend.addRows("customers", [customer]).addRows("sales", [invoice]);
  // What the database reports for this customer: ₹999 outstanding, no advance.
  backend.onRpc("get_customer_party_balances_all", () => [
    {
      customer_id: "cust-1",
      customer_name: "RAVI KUMAR",
      signed_balance: 999,
      advance_available: 0,
      direction: "Dr",
      net_position: 999,
      total_dr: 999,
      total_cr: 0,
      net_receivable: 999,
    },
  ]);
  backend.onRpc("get_customer_financial_snapshot_batch", () => [
    {
      customer_id: "cust-1",
      outstanding_dr: 999,
      advance_available: 0,
      cn_available_total: 0,
      cn_pending_count: 0,
      gross_outstanding_dr: 999,
      net_position: 999,
    },
  ]);
  backend.onRpc("generate_voucher_number", () => "RCP/26-27/1");
}

async function openReceiptFor999(page: import("@playwright/test").Page) {
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  await expect(page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Payments$/ }).first().click();
  const payments = page.getByRole("dialog").filter({ hasText: "Quick Payments" });
  await expect(payments).toBeVisible();

  await payments.getByText("Select customer...").click();
  await page.keyboard.type("RA");
  const option = page.getByRole("option", { name: /RAVI KUMAR/ });
  await expect(option).toContainText("₹999"); // outstanding shown in the picker
  await option.click();

  await payments.getByText("INV/26-27/1").click();
  const amount = payments.getByPlaceholder("₹ Amount").first();
  await expect(amount).toHaveValue("999.00"); // ticking the invoice fills its balance
  return { payments, amount };
}

test("Customer receipt: pick customer, tick invoice, Record Payment (cash)", async ({ page, backend }) => {
  owes999(backend);
  const { payments } = await openReceiptFor999(page);

  await payments.getByRole("button", { name: /Record Payment/ }).first().click();

  const receipt = page.getByRole("dialog", { name: "Payment Receipt" });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText(/Amount Received\s*₹999/);
  await expect(receipt).toContainText(/Current Balance\s*₹0/);
  await expect(receipt).toContainText("RAVI KUMAR");

  const vouchers = backend.calls.filter((c) => c.kind === "insert" && c.name === "voucher_entries");
  expect(vouchers).toHaveLength(1);
  expect(vouchers[0].body).toMatchObject({
    organization_id: E2E_ORG_ID,
    voucher_number: "RCP/26-27/1",
    voucher_type: "receipt",
    reference_type: "sale",
    reference_id: "sale-1",
    total_amount: 999,
    payment_method: "cash",
  });
  expect(backend.rpcCalls("generate_voucher_number")[0]).toMatchObject({ p_type: "receipt" });
  // Paid amount / status are settled in the database from the receipts.
  expect(backend.rpcCalls("compute_sale_settlement")).toContainEqual(expect.objectContaining({ p_sale_id: "sale-1" }));
});

test("Customer receipt: more than the outstanding is refused, nothing written", async ({ page, backend }) => {
  owes999(backend);
  const { payments, amount } = await openReceiptFor999(page);

  await amount.fill("1500");
  // The form will not even offer to record it…
  await expect(payments.getByRole("button", { name: /Record Payment/ }).first()).toBeDisabled();
  await amount.press("Enter");
  await page.waitForTimeout(1500);
  // …and nothing reaches the database.
  await expect(page.getByRole("dialog", { name: "Payment Receipt" })).toHaveCount(0);
  expect(backend.calls.filter((c) => c.kind === "insert" && c.name === "voucher_entries")).toEqual([]);
  expect(backend.rpcCalls("generate_voucher_number")).toEqual([]);
});
