import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Wholesale (Apps) dashboard: sections are compact cards, 5 apps per row, packed side by side
 * on wide screens instead of one half-empty full-width row per section (user request).
 */
for (const { width, columns } of [{ width: 1440, columns: 2 }, { width: 1920, columns: 3 }]) {
  test(`Apps dashboard at ${width}px: section cards side by side, 5 apps per row`, async ({ page, backend }, testInfo) => {
    backend.tables.settings[0].sale_settings = { wholesale_dashboard: true };
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${E2E_ORG_SLUG}`);
    // On a cold open the org home can be drawn twice for a moment: the route copy on screen
    // and the tab-cache copy still mounting in its hidden container. Measure the one shown.
    const sections = page.getByTestId("launcher-sections").filter({ visible: true });
    await expect(sections).toBeVisible({ timeout: 60_000 });

    // Let the icons' short rise-in animation finish before measuring.
    await page.waitForTimeout(1200);
    const sales = sections.getByRole("region", { name: "Sales" });
    const tiles = sales.locator(".wl-tile");
    const count = await tiles.count();
    expect(count).toBeGreaterThan(5);
    // 5 per row: the 6th app starts the second row under the 1st.
    const first = await tiles.nth(0).boundingBox();
    const fifth = await tiles.nth(4).boundingBox();
    const sixth = await tiles.nth(5).boundingBox();
    expect(Math.abs(fifth!.y - first!.y)).toBeLessThan(2);
    expect(sixth!.y).toBeGreaterThan(first!.y + 20);
    expect(Math.abs(sixth!.x - first!.x)).toBeLessThan(2);

    // Cards are laid out in N columns: distinct left edges.
    const lefts = await sections.locator("section").evaluateAll((els) =>
      [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))],
    );
    expect(lefts.length).toBe(columns);
    await page.screenshot({ path: testInfo.outputPath(`apps-${width}.png`) });
  });
}
