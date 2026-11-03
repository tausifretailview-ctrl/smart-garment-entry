import { describe, expect, it } from "vitest";
import {
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
  isSidebarOnlyWorkspacePath,
} from "@/lib/entryPageLayout";

describe("Godowns full view", () => {
  it("hides the top menu, quick buttons and window tabs on Godowns and Godown Transfers", () => {
    for (const path of ["/demo/godowns", "/demo/godown-transfers"]) {
      expect(isSidebarOnlyWorkspacePath(path)).toBe(true);
      expect(isHideGlobalHeaderPath(path)).toBe(true);
      expect(isFillHeightDashboardPath(path)).toBe(true);
    }
  });

  it("leaves the transfer entry screen to its own rule", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/godown-transfer-entry")).toBe(false);
    expect(isHideGlobalHeaderPath("/demo/godown-transfer-entry")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/godown-transfer-entry")).toBe(false);
  });
});
