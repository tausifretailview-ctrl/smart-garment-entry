import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
  isSidebarOnlyWorkspacePath,
} from "@/lib/entryPageLayout";
import { ALERT_POPUP_KINDS, ALERT_POPUP_LABELS, DEFAULT_ALERT_POPUP_PREFS } from "@/lib/alertPopups";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, "../..", p), "utf8");

describe("GST Filing full view", () => {
  it("hides the top menu and window tabs and fills the shell like GST Readiness", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/gst-filing")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/gst-filing")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/gst-filing")).toBe(true);
    const page = read("src/pages/GSTFiling.tsx");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("bg-gradient-to-br");
  });

  it("is reachable from the menus and opens a period on GST Reports", () => {
    expect(read("src/App.tsx")).toContain('path="gst-filing"');
    expect(read("src/components/AppSidebar.tsx")).toContain('to="/gst-filing"');
    expect(read("src/pages/ReportsHub.tsx")).toContain('path: "/gst-filing"');
    expect(read("src/pages/GSTReadiness.tsx")).toContain('"/gst-filing"');
    const reports = read("src/pages/GSTReports.tsx");
    expect(reports).toContain('searchParams.get("from")');
    expect(reports).toContain("Mark {gstr1Check.fp ? filingPeriodLabel(gstr1Check.fp) : \"period\"} as filed");
    expect(reports).toContain("Import error report");
  });

  it("reminds about a due return through the alert popups", () => {
    expect(ALERT_POPUP_KINDS).toContain("gst_due");
    expect(ALERT_POPUP_LABELS.gst_due).toBe("GST return due");
    expect(DEFAULT_ALERT_POPUP_PREFS.gst_due).toBe(true);
    const host = read("src/components/alert-popups/AlertPopupHost.tsx");
    expect(host).toContain('case "gst_due"');
    expect(host).toContain('path: "/gst-filing"');
  });

  it("refuses edits and deletes of bills inside a filed period", () => {
    expect(read("src/hooks/useSaveSale.tsx")).toContain("filedPeriodLockMessage(");
    expect(read("src/hooks/useSoftDelete.tsx")).toContain("filedPeriodLockMessage(");
  });
});
