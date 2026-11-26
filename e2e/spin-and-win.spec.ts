import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Spin & Win: the owner sets the wheel on Sales → Spin & Win; the customer opens /spin/<bill id>
 * from the POS bill's WhatsApp message and spins; the cashier checks the prize code.
 */

test("set-up page: starter wheel, gift product needed, save sends the campaign and prizes", async ({ page, backend }) => {
  backend.addRows("spin_campaigns", []).addRows("spin_prizes", []).addRows("spin_results", []);
  await page.goto(`/${E2E_ORG_SLUG}/spin-and-win`);
  const pageEl = page.getByTestId("spin-and-win-page").filter({ visible: true });
  await expect(pageEl).toBeVisible({ timeout: 60_000 });

  // Starter wheel: 4 prizes, the preview draws them.
  await expect(pageEl.getByTestId("spin-prize-row")).toHaveCount(4);
  await expect(pageEl.getByTestId("spin-wheel")).toBeVisible();
  await expect(pageEl.getByTestId("spin-problems")).toContainText("Prize 3: pick the gift product.");

  // Make prize 3 a ₹50 discount instead, turn on, save.
  const row3 = pageEl.getByTestId("spin-prize-row").nth(2);
  await row3.getByRole("combobox").click();
  await page.getByRole("option", { name: "Discount ₹" }).click();
  await row3.getByLabel("Discount ₹").fill("50");
  await expect(pageEl.getByTestId("spin-problems")).toHaveCount(0);
  await pageEl.getByTestId("spin-enabled").click();
  await pageEl.getByTestId("spin-save").click();
  await expect(page.getByText("Spin & Win saved").first()).toBeVisible();

  const upsert = backend.calls.find((c) => c.kind === "upsert" && c.name === "spin_campaigns");
  expect(upsert?.body).toMatchObject({ organization_id: E2E_ORG_ID, enabled: true, pos_only: true, link_valid_days: 3, code_valid_days: 30 });
  const prizes = backend.calls.filter((c) => c.kind === "insert" && c.name === "spin_prizes").map((c) => c.body as Record<string, unknown>);
  expect(prizes.map((p) => [p.label, p.prize_type, p.value, p.weight])).toEqual([
    ["10% OFF", "discount_percent", 10, 30],
    ["₹100 OFF", "discount_amount", 100, 20],
    ["Free Gift", "discount_amount", 50, 10],
    ["Better luck", "better_luck", 0, 40],
  ]);
});

test("set-up page before SQL 57 says so and cannot save", async ({ page, backend }) => {
  void backend; // signed-in mocked shop
  await page.route("**/rest/v1/spin_campaigns*", (route) =>
    route.fulfill({ status: 404, json: { code: "PGRST205", message: "Could not find the table 'public.spin_campaigns' in the schema cache" } }),
  );
  await page.goto(`/${E2E_ORG_SLUG}/spin-and-win`);
  await expect(page.getByTestId("spin-schema-missing").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("spin-save").filter({ visible: true })).toBeDisabled();
});

test.describe("customer spin page", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("spins once: the server's prize, a code to keep, the same result on reload", async ({ page, backend }) => {
    const prizes = [
      { id: "pz-a", label: "10% OFF", color: "#F97316" },
      { id: "pz-b", label: "₹100 OFF", color: "#0EA5E9" },
      { id: "pz-c", label: "Better luck", color: "#A855F7" },
    ];
    let spun: Record<string, unknown> | null = null;
    backend.onRpc("get_public_spin", () => ({
      ok: true, shop_name: "KS FOOTWEAR", logo_url: null, title: "Spin & Win", terms: "One spin per bill.", sale_number: "POS/26-27/810",
      prizes, result: spun, blocked: null,
    }));
    backend.onRpc("spin_for_sale", () => {
      spun = { ok: true, prize_id: "pz-b", label: "₹100 OFF", type: "discount_amount", value: 100, max_discount: null, code: "SW-7K3QX", expires_at: "2026-12-26T10:00:00Z", status: "won" };
      return spun;
    });

    await page.goto(`/spin/11111111-2222-3333-4444-555555555555`);
    await expect(page.getByTestId("public-spin-page")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("KS FOOTWEAR")).toBeVisible();
    await expect(page.getByText("Bill POS/26-27/810")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByTestId("spin-button").click();
    await expect(page.getByTestId("spin-result")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("spin-code")).toHaveText("SW-7K3QX");
    await expect(page.getByTestId("spin-result")).toContainText("₹100 off");
    expect(backend.rpcCalls("spin_for_sale")).toEqual([{ p_sale_id: "11111111-2222-3333-4444-555555555555" }]);

    // The wheel stopped with the won slice (index 1 of 3) under the pointer.
    const turn = await page.getByTestId("spin-wheel").locator("svg").first().evaluate((el) => getComputedStyle(el).transform);
    expect(turn).not.toBe("none");

    // Opening the link again: the same result, no Spin button.
    await page.reload();
    await expect(page.getByTestId("spin-code")).toHaveText("SW-7K3QX", { timeout: 60_000 });
    await expect(page.getByTestId("spin-button")).toHaveCount(0);
    expect(backend.rpcCalls("spin_for_sale")).toHaveLength(1);
  });

  test("expired link or campaign off: a message, no Spin button", async ({ page, backend }) => {
    backend.onRpc("get_public_spin", () => ({
      ok: true, shop_name: "KS", title: "Spin & Win", sale_number: "POS/1", result: null,
      prizes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], blocked: "This Spin & Win link has expired.",
    }));
    await page.goto(`/spin/11111111-2222-3333-4444-555555555555`);
    await expect(page.getByTestId("spin-blocked")).toHaveText("This Spin & Win link has expired.", { timeout: 60_000 });
    await expect(page.getByTestId("spin-button")).toHaveCount(0);
  });
});

test("check a prize code on the set-up page", async ({ page, backend }) => {
  backend.addRows("spin_campaigns", [{ id: "c1", organization_id: E2E_ORG_ID, enabled: true, title: "Spin & Win", pos_only: true, min_bill_amount: 0, link_valid_days: 3, code_valid_days: 30, min_redeem_amount: 500, terms: null }]);
  backend.addRows("spin_prizes", []).addRows("spin_results", []);
  backend.onRpc("check_spin_code", (args) =>
    args.p_code === "SW-7K3QX"
      ? { ok: true, code: "SW-7K3QX", label: "10% OFF", type: "discount_percent", value: 10, max_discount: 200, min_redeem_amount: 500, expires_at: "2026-12-26T10:00:00Z", won_on_sale: "POS/26-27/810", customer_name: "RAVI" }
      : { ok: false, error: "Already used on POS/26-27/812 (03 Dec 2026)." },
  );
  await page.goto(`/${E2E_ORG_SLUG}/spin-and-win`);
  const panel = page.getByTestId("spin-code-check").filter({ visible: true });
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await panel.getByPlaceholder("SW-XXXXX").fill("7k3qx");
  await panel.getByRole("button", { name: "Check" }).click();
  await expect(panel.getByTestId("spin-code-ok")).toContainText("10% off (up to ₹200)");
  await expect(panel.getByTestId("spin-code-ok")).toContainText("Won on POS/26-27/810 by RAVI");
  await panel.getByPlaceholder("SW-XXXXX").fill("SW-USED1");
  await panel.getByRole("button", { name: "Check" }).click();
  await expect(panel.getByTestId("spin-code-error")).toHaveText("Already used on POS/26-27/812 (03 Dec 2026).");
});
