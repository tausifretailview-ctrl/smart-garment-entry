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
const repoRoot = resolve(here, "../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

describe("Manufacturing full view", () => {
  it("hides the top menu, quick buttons and window tabs and fills the shell like Insights", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/manufacturing")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/manufacturing")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/manufacturing")).toBe(true);
    expect(read("src/pages/Manufacturing.tsx")).toContain("business-insights-workspace");
  });

  it("uses the Customer Balances look: coloured totals and dark table headers", () => {
    const page = read("src/pages/Manufacturing.tsx");
    expect(page).toContain("bg-gradient-to-br");
    const data = read("src/components/manufacturing/mfgData.ts");
    expect(data).toContain("bg-slate-800");
    for (const f of ["LotsTab.tsx", "LotDetail.tsx", "PendingWorkTab.tsx"]) {
      expect(read(`src/components/manufacturing/${f}`)).toContain("MFG_HEAD_ROW");
    }
  });
});
