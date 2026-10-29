import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
  isSidebarOnlyWorkspacePath,
} from "@/lib/entryPageLayout";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, "../..", p), "utf8");

describe("GST Readiness full view", () => {
  it("hides the top menu and window tabs and fills the shell like GST Analysis", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/gst-readiness")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/gst-readiness")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/gst-readiness")).toBe(true);
    const page = read("src/pages/GSTReadiness.tsx");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("bg-gradient-to-br");
  });

  it("has the filing preferences and is reachable from the menus", () => {
    const page = read("src/pages/GSTReadiness.tsx");
    for (const label of ["Filing preferences", "Regular (monthly)", "QRMP (quarterly)", "Composition", "Turnover under ₹5 crore"]) {
      expect(page).toContain(label);
    }
    expect(read("src/App.tsx")).toContain('path="gst-readiness"');
    expect(read("src/components/AppSidebar.tsx")).toContain('to="/gst-readiness"');
    expect(read("src/pages/ReportsHub.tsx")).toContain('path: "/gst-readiness"');
    expect(read("src/pages/GSTReports.tsx")).toContain('"/gst-readiness"');
  });
});
