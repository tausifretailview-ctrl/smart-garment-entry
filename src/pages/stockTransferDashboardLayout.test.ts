import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isEntryFullscreenPath,
  isEntrySidebarOnlyPath,
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
} from "@/lib/entryPageLayout";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

describe("Stock Transfer dashboard + entry", () => {
  it("dashboard fills the shell like Insights and hides the top bars", () => {
    expect(isFillHeightDashboardPath("/demo/stock-transfer")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/stock-transfer")).toBe(true);
    const page = read("src/pages/StockTransfer.tsx");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("InsightsKpiCard");
    expect(page).toContain("InsightsTableHeader");
    expect(page).toContain("accept_stock_transfer");
    expect(page).toContain("reject_stock_transfer");
    expect(page).toContain('orgNavigate("/barcode-printing", { state: { purchaseItems } })');
  });

  it("entry is a full-view voucher page like Sale Return", () => {
    expect(isEntryFullscreenPath("/demo/stock-transfer-entry")).toBe(true);
    expect(isEntrySidebarOnlyPath("/demo/stock-transfer-entry")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/stock-transfer-entry")).toBe(true);
    // the dashboard regex must not swallow the entry route
    expect(isFillHeightDashboardPath("/demo/stock-transfer-entry")).toBe(false);
    const page = read("src/pages/StockTransferEntry.tsx");
    expect(page).toContain("entryPageShellClass");
    expect(page).toContain("!text-[17px]");
    // Sale bill style live search + print prompt after send
    expect(page).toContain("searchTransferProducts");
    expect(page).toContain("Print Transfer Note?");
    const search = read("src/utils/stockTransferSearch.ts");
    expect(search).toContain("buildProductTextOrFilter");
    expect(search).toContain("scoreProductSearchMatch");
    const app = read("src/App.tsx");
    const start = app.indexOf('path="stock-transfer-entry"');
    expect(app.slice(start, start + 400)).toContain("<FullScreenLayout>");
  });

  it("menu lives under Inventory, not Tools", () => {
    const sidebar = read("src/components/AppSidebar.tsx");
    const inv = sidebar.indexOf("{/* Inventory */}");
    const at = sidebar.indexOf('NavLink to="/stock-transfer"');
    expect(at).toBeGreaterThan(inv);
    const menubar = read("src/components/desktop/HeaderMenubar.tsx");
    const tools = menubar.indexOf(">Tools<");
    expect(menubar.indexOf('orgNavigate("/stock-transfer")')).toBeLessThan(tools);
  });
});
