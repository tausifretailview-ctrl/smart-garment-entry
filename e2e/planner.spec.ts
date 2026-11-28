import { addDays, format } from "date-fns";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Calendar - Planner (Nov 2026): tasks, payment collections and cheque deposits on dates, with
 * staff tagged. Pending work is red on its day and after until it is marked done.
 */
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const today = iso(new Date());
const yesterday = iso(addDays(new Date(), -1));

const row = (over: Record<string, unknown>) => ({
  organization_id: E2E_ORG_ID,
  entry_time: null,
  notes: null,
  customer_id: null,
  supplier_id: null,
  party_name: null,
  amount: null,
  cheque_number: null,
  bank_name: null,
  cheque_status: null,
  priority: "normal",
  status: "pending",
  assigned_employee_ids: [],
  done_at: null,
  deleted_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...over,
});

test("Planner: overdue work is red until done; a cheque deposit is added with staff tagged", async ({ page, backend }) => {
  backend
    .addRows("employees", [
      { id: "e1", organization_id: E2E_ORG_ID, employee_name: "JAVED BHAI", designation: "Salesman", status: "active", user_id: null, deleted_at: null },
      { id: "e2", organization_id: E2E_ORG_ID, employee_name: "RAJU", designation: "Accounts", status: "active", user_id: null, deleted_at: null },
    ])
    .addRows("customers", [])
    .addRows("planner_entries", [
      row({ id: "p1", entry_date: yesterday, entry_type: "collection", title: "Collect payment – Gupta Footwear", party_name: "Gupta Footwear", amount: 18500, assigned_employee_ids: ["e1"] }),
      row({ id: "p2", entry_date: today, entry_type: "task", title: "Send samples to Mehta", status: "done" }),
    ])
    .keepInserts("planner_entries");

  await page.goto(`/${E2E_ORG_SLUG}/planner`);
  const planner = page.getByTestId("planner-page").filter({ visible: true });
  await expect(planner.getByTestId("planner-month")).toHaveText(format(new Date(), "MMMM yyyy"), { timeout: 60_000 });
  await expect(planner.getByTestId("planner-overdue")).toContainText("1");
  await expect(planner.getByTestId("planner-collections")).toContainText("₹18,500");

  // Yesterday's collection: red on the calendar and in the day list, with the staff name.
  await planner.getByTestId(`planner-day-${yesterday}`).click();
  const card = planner.getByTestId("planner-entry").filter({ hasText: "Gupta Footwear" });
  await expect(card.getByTestId("planner-entry-state")).toHaveText("Overdue");
  await expect(card).toHaveClass(/border-red-300/);
  await expect(card).toContainText("JAVED BHAI");

  await card.getByRole("button", { name: "Mark done Collect payment – Gupta Footwear" }).click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name.startsWith("planner_entries")).length)
    .toBe(1);
  expect(backend.calls.find((c) => c.kind === "update" && c.name.startsWith("planner_entries"))!.body).toEqual({ status: "done" });

  // Add a cheque deposit for today, tagged to RAJU.
  await planner.getByTestId(`planner-day-${today}`).click();
  await planner.getByTestId("planner-add").click();
  const dialog = page.getByRole("dialog", { name: "Add to planner" });
  await dialog.getByRole("radio", { name: "Cheque" }).click();
  await dialog.getByLabel("Customer").fill("Ramesh Traders");
  // Shops type in capitals: the title follows the party as typed.
  await expect(dialog.getByLabel("What is to be done")).toHaveValue(/^Deposit cheque – Ramesh Traders$/i);
  await dialog.getByLabel("Amount (₹)").fill("25000");
  await dialog.getByLabel("Cheque no.").fill("004512");
  await dialog.getByLabel("Bank").fill("HDFC");
  await dialog.getByRole("button", { name: "RAJU" }).click();
  await dialog.getByTestId("planner-save").click();

  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name.startsWith("planner_entries")).length)
    .toBe(1);
  expect(backend.calls.find((c) => c.kind === "insert" && c.name.startsWith("planner_entries"))!.body).toMatchObject({
    organization_id: E2E_ORG_ID,
    entry_date: today,
    entry_type: "cheque",
    title: expect.stringMatching(/^Deposit cheque – Ramesh Traders$/i),
    party_name: expect.stringMatching(/^Ramesh Traders$/i),
    amount: 25000,
    cheque_number: "004512",
    bank_name: "HDFC",
    cheque_status: "received",
    status: "pending",
    assigned_employee_ids: ["e2"],
  });
  await expect(dialog).toHaveCount(0);
  // Due today and not deposited yet: red in today's list, with the cheque buttons.
  const cheque = planner.getByTestId("planner-entry").filter({ hasText: "Ramesh Traders" });
  await expect(cheque.getByTestId("planner-entry-state")).toHaveText("Due today");
  await expect(cheque).toContainText("Cheque 004512 · HDFC");
  await expect(cheque.getByRole("button", { name: /^Deposited Deposit cheque – Ramesh Traders$/i })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("planner-desktop.png") });
});

test("Planner is in the menu for every shop", async ({ page, backend }) => {
  backend.addRows("planner_entries", []).addRows("employees", []);
  await page.goto(`/${E2E_ORG_SLUG}/planner`);
  await expect(page.getByTestId("planner-page").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /Calendar - Planner/ }).filter({ visible: true }).first()).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the month fits the screen with dots for each day's work, and the day list below", async ({ page, backend }) => {
    backend
      .addRows("employees", [])
      .addRows("planner_entries", [
        row({ id: "p1", entry_date: yesterday, entry_type: "collection", title: "Collect payment – Gupta Footwear", amount: 18500 }),
        row({ id: "p2", entry_date: today, entry_type: "task", title: "Send samples to Mehta" }),
      ]);
    await page.goto(`/${E2E_ORG_SLUG}/planner`);
    const planner = page.getByTestId("planner-page").filter({ visible: true });
    await expect(planner.getByTestId("planner-grid")).toBeVisible({ timeout: 60_000 });
    await expect(planner.getByTestId("planner-entry")).toHaveCount(1);
    await expect(planner.getByTestId("planner-entry")).toContainText("Send samples to Mehta");
    const box = await planner.getByTestId("planner-grid").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await page.waitForTimeout(800);
    await page.screenshot({ path: test.info().outputPath("planner-phone.png"), fullPage: true });
  });
});
