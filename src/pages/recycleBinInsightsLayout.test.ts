import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS } from "@/lib/chunkLoadRetry";
import { TAB_PAGE_REGISTRY } from "@/lib/tabPageRegistry";
import { resolveTabLoadShell } from "@/lib/tabLoadShell";
import { tabLoadMessage } from "@/lib/tabLoadLabels";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("Recycle Bin Insights chrome", () => {
  it("uses the Business Insights workspace, KPI strip, pill tabs, and dark table", () => {
    const page = readFileSync(resolve(repoRoot, "src/pages/RecycleBin.tsx"), "utf8");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("InsightsPanel");
    expect(page).toContain("InsightsKpiStrip");
    expect(page).toContain("InsightsTableHeader");
    expect(page).toContain("INSIGHTS_BODY_ROW");
    expect(page).toContain("RECYCLE_TAB_TRIGGER");
    expect(page).toContain("data-[state=active]:bg-slate-700");
    expect(page).toMatch(/isLoading \? \(/);
    expect(page).toContain("ListTableSkeleton");
    expect(page).not.toContain("text-3xl font-bold");
    expect(page).not.toContain('variant="destructive" className="ml-1 h-5');
  });

  it("fills the dashboard shell like Insights and hides top chrome", () => {
    const layout = readFileSync(resolve(repoRoot, "src/lib/entryPageLayout.ts"), "utf8");
    expect(layout).toContain("recycle-bin");
    expect(layout).toMatch(/FILL_HEIGHT_DASHBOARD_PATH[\s\S]*recycle-bin/);
    expect(layout).toMatch(/SIDEBAR_ONLY_WORKSPACE_PATH[\s\S]*recycle-bin/);
  });

  it("loads inside the shell instead of blanking the app", () => {
    const app = readFileSync(resolve(repoRoot, "src/App.tsx"), "utf8");
    const start = app.indexOf('path="recycle-bin"');
    const block = app.slice(start, app.indexOf('path="user-rights"', start));
    const layoutAt = block.indexOf("<Layout>");
    const suspenseAt = block.indexOf("<Suspense fallback={<LazyFallback />}>");
    const pageAt = block.indexOf("<RecycleBin />");
    expect(layoutAt).toBeGreaterThan(-1);
    expect(suspenseAt).toBeGreaterThan(layoutAt);
    expect(pageAt).toBeGreaterThan(suspenseAt);

    expect(TAB_PAGE_REGISTRY["recycle-bin"]?.layout).toBe("layout");
    expect(TAB_PAGE_REGISTRY["recycle-bin"]?.roles).toEqual(["admin"]);
    expect(POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS).toContain("recycle-bin");
    expect(resolveTabLoadShell("recycle-bin")).toBe("dashboard");
    expect(tabLoadMessage("recycle-bin", "dashboard")).toBe("Opening Recycle Bin…");
  });

  it("requires permanent-delete password before hard delete", () => {
    const page = readFileSync(resolve(repoRoot, "src/pages/RecycleBin.tsx"), "utf8");
    expect(page).toContain('RECYCLE_BIN_PERMANENT_DELETE_PASSWORD = "admin@123"');
    expect(page).toContain("Enter password to permanently delete");
    expect(page).toContain("type=\"password\"");
  });
});
