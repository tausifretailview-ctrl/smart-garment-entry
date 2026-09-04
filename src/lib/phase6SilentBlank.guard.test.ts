import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { destinationsWithNoWatchdog } from "./layoutCrossingAudit";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase 6 silent-blank + cloud-usage guards", () => {
  it("OrgLayout attributes every org route to cloud-usage (not only Accounts)", () => {
    const layout = src("src/components/OrgLayout.tsx");
    expect(layout).toContain("setCloudUsageRoutePath");
    expect(layout).toContain("from \"@/lib/cloudUsageDiagnostics\"");
    expect(layout).toMatch(/setCloudUsageRoutePath\(resolvedCurrentPath/);
  });

  it("Quick Payments overlays the picker bucket and does not wipe the tab path", () => {
    const payments = src("src/components/FloatingPayments.tsx");
    expect(payments).toContain("setCloudUsageRouteOverlay");
    expect(payments).toContain("pos-sales:quick-payments");
    expect(payments).not.toContain("setCloudUsageRoutePath(\"\")");
  });

  it("Quick Payments supplier list uses paginated fetchAllSuppliers", () => {
    const payments = src("src/components/FloatingPayments.tsx");
    expect(payments).toContain("fetchAllSuppliers");
    expect(payments).not.toMatch(/\.from\("suppliers"\)/);
    expect(payments).toContain("loadSupplierBalanceMapForOrg");
  });

  it("Accounts no longer owns route attribution", () => {
    const accounts = src("src/pages/Accounts.tsx");
    expect(accounts).not.toContain("setCloudUsageRoutePath");
  });

  it("TabCachedPages uses the shared load-shell mapper", () => {
    const tabs = src("src/components/TabCachedPages.tsx");
    expect(tabs).toContain('from "@/lib/tabLoadShell"');
    expect(tabs).toContain("resolveTabLoadShell");
    expect(tabs).toMatch(/SOFT_LOADING_HINT_MS = 3_000/);
    expect(tabs).toMatch(/if \(silent && !showSoftHint\) return null/);
  });

  it("LazyFallback always paints a shell (never return null)", () => {
    const app = src("src/App.tsx");
    const fallback = app.slice(app.indexOf("const LazyFallback"), app.indexOf("// Check if this is a Field Sales"));
    expect(fallback).toContain("AppBootSplash");
    expect(fallback).toContain("DashboardSkeleton");
    expect(fallback).not.toMatch(/return null/);
  });

  it("Insights stays permission-gated on Outlet, not a silent tab-cache miss", () => {
    const registry = src("src/lib/tabPageRegistry.ts");
    expect(registry).toContain("`insights` is deliberately NOT registered");
    const app = src("src/App.tsx");
    expect(app).toContain('path="insights"');
    expect(app).toContain('MenuPermissionRoute permission="business_insights"');
  });

  it("blank-frame watchdog still fires at 1.2s and load shells count as painted", () => {
    const layout = src("src/components/OrgLayout.tsx");
    expect(layout).toMatch(/BLANK_FRAME_GRACE_MS = 1_200/);
    expect(layout).toContain("hasPaintedWorkspaceContent");
    expect(src("src/components/AppBootSplash.tsx")).toContain('data-ezzy-load-shell="splash"');
    expect(src("src/components/ui/skeletons.tsx")).toContain('data-ezzy-load-shell="dashboard"');
    expect(destinationsWithNoWatchdog()).toEqual([]);
  });

  it("cloud-usage stays opt-in and never auto-enables in DEV", () => {
    const app = src("src/App.tsx");
    expect(app).toContain("initCloudUsageDiagnostics");
    expect(
      /import\.meta\.env\.DEV\s*\|\|[\s\S]{0,240}initCloudUsageDiagnostics/.test(app),
    ).toBe(false);
    const diag = src("src/lib/cloudUsageDiagnostics.ts");
    expect(diag).toContain("PHASE6_EXPECTED_RPCS");
    expect(diag).toContain("get_dashboard_stock_summary");
    expect(diag).toContain("copyJson");
  });
});
