import type { Page } from "@playwright/test";
import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * A screen kept open in a background window tab does not reload when its data changes (a bill
 * saved elsewhere); it reloads once when the user returns to it (review items S2, L2).
 */

/** What saving a quotation does to the Quotation dashboard (invalidateQuotationViews): mark out of date, refetch "all". */
const quotationSaved = (page: Page) =>
  page.evaluate(async () => {
    type Fiber = { memoizedProps?: { client?: unknown }; child?: Fiber; sibling?: Fiber };
    type Client = { invalidateQueries: (f: unknown) => Promise<void> };
    const rootEl = document.getElementById("root") as unknown as Record<string, Fiber>;
    const key = Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$"));
    const stack: Array<Fiber | undefined> = key ? [rootEl[key]] : [];
    while (stack.length) {
      const fiber = stack.pop();
      if (!fiber) continue;
      const client = fiber.memoizedProps?.client as Client | undefined;
      if (client && typeof client.invalidateQueries === "function") {
        await client.invalidateQueries({ queryKey: ["quotation-summary"], refetchType: "all" });
        return true;
      }
      stack.push(fiber.sibling, fiber.child);
    }
    return false;
  });

test("Quotation dashboard in a background tab waits for the user before reloading", async ({ page, backend }) => {
  const statsLoads = () => backend.rpcCalls("get_quotation_summary").length;
  const open = (path: string) =>
    page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/${E2E_ORG_SLUG}/${path}`);

  const dashboardPane = page.locator('[data-tab-cache-path="quotation-dashboard"]');

  await page.goto(`/${E2E_ORG_SLUG}/quotation-dashboard`);
  await expect.poll(statsLoads, { timeout: 60_000 }).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");

  // Open the second window once and let it settle, so both windows are warm.
  await open("customers");
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/customers$`));
  await expect(dashboardPane).toHaveAttribute("aria-hidden", "true");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(6000);

  await open("quotation-dashboard");
  await expect(dashboardPane).toHaveAttribute("aria-hidden", "false");
  await page.waitForLoadState("networkidle");
  const start = statsLoads();

  // Shown: a saved quotation reloads the dashboard straight away.
  expect(await quotationSaved(page)).toBe(true);
  await expect.poll(statsLoads).toBe(start + 1);
  await page.waitForLoadState("networkidle");

  // Back to the other window; the dashboard stays open behind it.
  await open("customers");
  await expect(dashboardPane).toHaveAttribute("aria-hidden", "true");
  await page.waitForLoadState("networkidle");

  // Three quotations saved meanwhile: the hidden dashboard asks the database for nothing.
  for (let i = 0; i < 3; i++) expect(await quotationSaved(page)).toBe(true);
  await page.waitForTimeout(6000);
  expect(statsLoads()).toBe(start + 1);

  // Back on the dashboard: one reload, and it is live again.
  await open("quotation-dashboard");
  await expect(dashboardPane).toHaveAttribute("aria-hidden", "false");
  await expect.poll(statsLoads).toBe(start + 2);
  await page.waitForLoadState("networkidle");
  expect(statsLoads()).toBe(start + 2);

  expect(await quotationSaved(page)).toBe(true);
  await expect.poll(statsLoads).toBe(start + 3);
});
