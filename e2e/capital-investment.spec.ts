import { readFileSync } from "node:fs";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Accounts → Capital & Investment (user request): the owner's investment and withdrawal
 * post a voucher (cash tallies) and a journal (Dr Cash/Bank, Cr Capital or the reverse).
 */
const seedSource = readFileSync("src/utils/accounting/seedDefaultAccounts.ts", "utf8");
const systemAccounts = [...seedSource.matchAll(
  /account_code: "(\d+)",\s*account_name: "([^"]+)",\s*account_type: "(\w+)",\s*account_group: "([^"]+)"/g,
)].map((m) => ({
  id: `acc-${m[1]}`, organization_id: E2E_ORG_ID, account_code: m[1], account_name: m[2],
  account_type: m[3], account_group: m[4], parent_account_id: null, is_system_account: true,
}));
const capitalLedgers = [
  { id: "cap-owner", organization_id: E2E_ORG_ID, account_code: "3000", account_name: "Owner's Capital", account_type: "Equity", account_group: "Capital Account", parent_account_id: null, is_system_account: false },
  { id: "cap-partner", organization_id: E2E_ORG_ID, account_code: "3001", account_name: "Partner B Capital", account_type: "Equity", account_group: "Capital Account", parent_account_id: null, is_system_account: false },
  // Day-close drawings ledger: never offered for an investment.
  { id: "cap-drawings", organization_id: E2E_ORG_ID, account_code: "3100", account_name: "Owner's Drawings", account_type: "Equity", account_group: "Capital Account", parent_account_id: null, is_system_account: false },
];
const pastVouchers = [
  { id: "pv1", organization_id: E2E_ORG_ID, voucher_number: "RCP/26-27/9", voucher_date: "2026-11-01", voucher_type: "receipt", reference_type: "third_party", reference_id: "cap-owner", total_amount: 200000, payment_method: "cash", description: "Capital Invested: Owner's Capital — Opening funds", deleted_at: null, created_at: "2026-11-01T10:00:00Z" },
  { id: "pv2", organization_id: E2E_ORG_ID, voucher_number: "PAY/26-27/4", voucher_date: "2026-11-10", voucher_type: "payment", reference_type: "third_party", reference_id: "cap-owner", total_amount: 20000, payment_method: "cash", description: "Capital Withdrawn: Owner's Capital — Personal use", deleted_at: null, created_at: "2026-11-10T10:00:00Z" },
  // A loan from a third party: not capital, not on this screen.
  { id: "pv3", organization_id: E2E_ORG_ID, voucher_number: "RCP/26-27/5", voucher_date: "2026-11-05", voucher_type: "receipt", reference_type: "third_party", reference_id: "loan-ledger", total_amount: 99999, payment_method: "cash", description: "Third-party Received: Loan — x", deleted_at: null, created_at: "2026-11-05T10:00:00Z" },
];

test("Capital & Investment: investment and withdrawal post voucher + journal", async ({ page, backend }) => {
  backend.addRows("chart_of_accounts", [...systemAccounts, ...capitalLedgers]).addRows("voucher_entries", pastVouchers);
  let number = 0;
  backend.onRpc("generate_voucher_number", (body) => `${body.p_type === "receipt" ? "RCP" : "PAY"}/26-27/${++number + 20}`);

  await page.goto(`/${E2E_ORG_SLUG}/capital-investment`);
  const screen = page.getByTestId("capital-investment");
  await expect(screen.getByRole("heading", { name: "Capital & Investment" })).toBeVisible({ timeout: 60_000 });

  // Totals from earlier entries (the loan voucher is not capital).
  await expect(screen.getByTestId("capital-total-invested")).toContainText("2,00,000");
  await expect(screen.getByTestId("capital-total-withdrawn")).toContainText("20,000");
  await expect(screen.getByTestId("capital-total-net")).toContainText("1,80,000");
  await expect(screen.getByTestId("capital-owners")).toContainText("Owner's Capital");
  await expect(screen.getByTestId("capital-owners")).not.toContainText("Owner's Drawings");
  await expect(screen.getByTestId("capital-history").locator("tbody tr")).toHaveCount(2);

  // Investment into cash.
  await screen.getByRole("combobox", { name: "Owner / partner" }).click();
  await page.getByRole("option", { name: /Owner's Capital/ }).click();
  await screen.getByLabel("Amount (₹)").fill("500000");
  await expect(screen.getByTestId("capital-preview")).toContainText("Cash in Hand");
  await screen.getByRole("button", { name: "Save investment" }).click();
  await expect.poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "journal_lines").length).toBe(1);

  const voucher = backend.calls.find((c) => c.kind === "insert" && c.name === "voucher_entries")!.body as Record<string, unknown>;
  expect(voucher).toMatchObject({
    voucher_type: "receipt",
    reference_type: "third_party",
    reference_id: "cap-owner",
    payment_method: "cash",
    total_amount: 500000,
    description: "Capital Invested: Owner's Capital — Capital introduced",
  });
  const lines = backend.calls.find((c) => c.kind === "insert" && c.name === "journal_lines")!.body as Array<Record<string, unknown>>;
  expect(lines.map((l) => [l.account_id, l.debit_amount, l.credit_amount])).toEqual([
    ["acc-1000", 500000, 0],
    ["cap-owner", 0, 500000],
  ]);

  // Withdrawal from the bank by the partner.
  await screen.getByRole("button", { name: /Withdrawal \(money out\)/ }).click();
  await screen.getByRole("combobox", { name: "Owner / partner" }).click();
  await page.getByRole("option", { name: /Partner B Capital/ }).click();
  await screen.getByRole("combobox", { name: "Paid from" }).click();
  await page.getByRole("option", { name: "Bank Account" }).click();
  await screen.getByLabel("Amount (₹)").fill("15000");
  await screen.getByLabel("Narration").fill("Personal withdrawal");
  await screen.getByRole("button", { name: "Save withdrawal" }).click();
  await expect.poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "journal_lines").length).toBe(2);
  const vouchers = backend.calls.filter((c) => c.kind === "insert" && c.name === "voucher_entries").map((c) => c.body as Record<string, unknown>);
  expect(vouchers[1]).toMatchObject({
    voucher_type: "payment",
    reference_id: "cap-partner",
    payment_method: "bank_transfer",
    total_amount: 15000,
    description: "Capital Withdrawn: Partner B Capital — Personal withdrawal",
  });
  const lines2 = backend.calls.filter((c) => c.kind === "insert" && c.name === "journal_lines")[1].body as Array<Record<string, unknown>>;
  expect(lines2.map((l) => [l.account_id, l.debit_amount, l.credit_amount])).toEqual([
    ["cap-partner", 15000, 0],
    ["acc-1010", 0, 15000],
  ]);

  // Add a partner: a new Equity / Capital Account ledger with the next free 30xx code.
  await screen.getByTestId("capital-owners").getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Name").fill("Rahim Khan Capital");
  await page.getByRole("button", { name: "Create" }).click();
  await expect.poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "chart_of_accounts").length).toBeGreaterThan(0);
  const created = backend.calls.filter((c) => c.kind === "insert" && c.name === "chart_of_accounts").pop()!.body as Record<string, unknown>;
  // The app capitalises typed text everywhere, ledger names included.
  expect(created).toMatchObject({ account_name: "RAHIM KHAN CAPITAL", account_type: "Equity", account_group: "Capital Account", account_code: "3002" });
});
