import { afterEach, describe, expect, it } from "vitest";
import {
  buildCloudUsageJson,
  buildCloudUsageReport,
  getCloudUsageAttributedPath,
  getCloudUsageEvents,
  isSupabaseRequest,
  parseSupabasePath,
  PHASE6_EXPECTED_RPCS,
  recordSupabaseUsage,
  resetCloudUsageCounters,
  setCloudUsageRouteOverlay,
  setCloudUsageRoutePath,
} from "./cloudUsageDiagnostics";

afterEach(() => {
  resetCloudUsageCounters();
  setCloudUsageRoutePath("");
  setCloudUsageRouteOverlay(null);
});

describe("parseSupabasePath", () => {
  it("extracts REST tables and RPC names", () => {
    expect(parseSupabasePath("https://x.supabase.co/rest/v1/sales?select=*")).toEqual({
      table: "sales",
      path: "/rest/v1/sales",
    });
    expect(parseSupabasePath("https://x.supabase.co/rest/v1/rpc/get_dashboard_stock_summary")).toEqual({
      rpc: "get_dashboard_stock_summary",
      path: "/rest/v1/rpc/get_dashboard_stock_summary",
    });
  });

  it("ignores non-Supabase URLs", () => {
    expect(isSupabaseRequest("/assets/index.js")).toBe(false);
    expect(isSupabaseRequest("https://x.supabase.co/rest/v1/sales")).toBe(true);
    expect(recordSupabaseUsage({ url: "https://cdn.example/app.js" })).toBeNull();
  });
});

describe("route attribution", () => {
  it("OrgLayout path is the default bucket; Quick Payments overlays without wiping it", () => {
    setCloudUsageRoutePath("pos-sales");
    expect(getCloudUsageAttributedPath()).toBe("pos-sales");
    recordSupabaseUsage({
      url: "https://x.supabase.co/rest/v1/sales",
      method: "GET",
      status: 200,
      durationMs: 12,
    });

    setCloudUsageRouteOverlay("pos-sales:quick-payments");
    expect(getCloudUsageAttributedPath()).toBe("pos-sales:quick-payments");
    recordSupabaseUsage({
      url: "https://x.supabase.co/rest/v1/rpc/fetch_picker",
      method: "POST",
      status: 200,
      durationMs: 40,
    });

    setCloudUsageRouteOverlay(null);
    expect(getCloudUsageAttributedPath()).toBe("pos-sales");

    const json = buildCloudUsageJson();
    expect(json.phase).toBe("6");
    expect(json.totalRequests).toBe(2);
    expect(json.byRoute.map((b) => b.routePath).sort()).toEqual([
      "pos-sales",
      "pos-sales:quick-payments",
    ]);
    expect(json.expectedRpcs).toEqual([...PHASE6_EXPECTED_RPCS]);
  });

  it("text report is pasteable Phase 6 output", () => {
    setCloudUsageRoutePath("accounts");
    recordSupabaseUsage({
      url: "https://x.supabase.co/rest/v1/rpc/get_accounts_dashboard_metrics",
      method: "POST",
      status: 200,
      durationMs: 8,
    });
    const text = buildCloudUsageReport();
    expect(text).toContain("Phase 6");
    expect(text).toContain("rpc/get_accounts_dashboard_metrics");
    expect(text).toContain("copyJson()");
    expect(getCloudUsageEvents()).toHaveLength(1);
  });
});
