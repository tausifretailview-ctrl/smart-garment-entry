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

describe("GST Analysis full view", () => {
  it("hides the top menu and window tabs and fills the shell like Manufacturing", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/gst-analysis")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/gst-analysis")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/gst-analysis")).toBe(true);
    const page = read("src/pages/GSTAnalysis.tsx");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("bg-gradient-to-br");
    expect(page).toContain("bg-slate-800");
  });

  it("has the Sale, Purchase and Final GST Payable tabs and is reachable from the menus", () => {
    const page = read("src/pages/GSTAnalysis.tsx");
    for (const label of ["Sale GST", "Purchase GST (ITC)", "Final GST Payable"]) expect(page).toContain(label);
    expect(read("src/App.tsx")).toContain('path="gst-analysis"');
    expect(read("src/components/AppSidebar.tsx")).toContain('to="/gst-analysis"');
    expect(read("src/pages/ReportsHub.tsx")).toContain('path: "/gst-analysis"');
  });
});
