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

  test("spins once: the server's prize, a code to keep, the same result on reload", async ({ page, backend }, testInfo) => {
    // The shop's "desktop view" switch on this phone must not shrink the customer page.
    await page.addInitScript(() => localStorage.setItem("ezzyerp:force-desktop-view", "1"));
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
    expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content"))).toContain("width=device-width");
    await expect(page.getByText("Bill POS/26-27/810")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await expect(page.locator("#splash-screen")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("spin-before.png") });
    await page.getByTestId("spin-button").click();
    await expect(page.getByTestId("spin-result")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: testInfo.outputPath("spin-won.png"), fullPage: true });
    await expect(page.getByTestId("spin-code")).toHaveText("SW-7K3QX");
    await expect(page.getByTestId("spin-result")).toContainText("₹100 off");
    expect(backend.rpcCalls("spin_for_sale")).toEqual([{ p_sale_id: "11111111-2222-3333-4444-555555555555" }]);

    // The wheel stopped with the won slice (index 1 of 3) under the pointer.
    const turn = await page.getByTestId("spin-wheel").locator("svg[role=img]").evaluate((el) => getComputedStyle(el).transform);
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

test.describe("POS takes the prize code", () => {
  const product = {
    id: "p1", organization_id: E2E_ORG_ID, product_name: "JEANS NARROW", brand: "ACME", category: "JEANS", style: null,
    color: "BLUE", hsn_code: "6203", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
  };
  const variant = {
    id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "32", color: "BLUE", barcode: "100001",
    sale_price: 1000, mrp: 1000, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
  };

  test("SW code in the scan box: ₹100 off this bill, marked used when the bill saves", async ({ page, backend }) => {
    backend.addRows("products", [product]).addRows("product_variants", [variant]);
    backend.onRpc("check_spin_code", () => ({
      ok: true, code: "SW-7K3QX", label: "₹100 OFF", type: "discount_amount", value: 100, max_discount: null,
      min_redeem_amount: 500, expires_at: "2026-12-26T10:00:00Z", won_on_sale: "POS/26-27/810", customer_name: "RAVI",
    }));
    backend.onRpc("redeem_spin_code", () => true);
    backend.onRpc("save_sale_with_items_numbered", (args) => {
      const sale = args.p_sale as Record<string, unknown>;
      return { sale: { ...sale, id: "sale-77", sale_number: "POS/26-27/900" }, items_inserted: 1, settled: true };
    });

    await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
    const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
    await expect(scan).toBeVisible({ timeout: 60_000 });

    // Too early: an empty bill is below the ₹500 minimum.
    await scan.fill("sw7k3qx");
    await scan.press("Enter");
    await expect(page.getByText("Bill too small for this prize").first()).toBeVisible();
    await page.getByRole("button", { name: "OK" }).click(); // POS shows errors as a pop-up

    await scan.fill("100001");
    await scan.press("Enter");
    await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);
    await scan.fill("SW-7K3QX");
    await scan.press("Enter");
    await expect(page.getByText("Spin & Win: ₹100 OFF").first()).toBeVisible();
    await expect(scan).toHaveValue("");

    await page.keyboard.press("F1");
    await expect(page.getByRole("alertdialog", { name: "Invoice Saved!" })).toBeVisible();

    const [save] = backend.rpcCalls("save_sale_with_items_numbered") as Array<{ p_sale: Record<string, unknown> }>;
    expect(save.p_sale).toMatchObject({ flat_discount_amount: 100, net_amount: 900 });
    expect(String(save.p_sale.notes)).toContain("Spin & Win SW-7K3QX");
    await expect.poll(() => backend.rpcCalls("redeem_spin_code")).toEqual([
      { p_org: E2E_ORG_ID, p_code: "SW-7K3QX", p_sale_id: "sale-77" },
    ]);
  });

  test("a used code is refused at POS", async ({ page, backend }) => {
    backend.addRows("products", [product]).addRows("product_variants", [variant]);
    backend.onRpc("check_spin_code", () => ({ ok: false, error: "Already used on POS/26-27/812 (03 Dec 2026)." }));
    await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
    const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
    await expect(scan).toBeVisible({ timeout: 60_000 });
    await scan.fill("SW-USED2");
    await scan.press("Enter");
    await expect(page.getByText("Already used on POS/26-27/812 (03 Dec 2026).").first()).toBeVisible();
    expect(backend.rpcCalls("redeem_spin_code")).toEqual([]);
  });
});
