import { describe, expect, it } from "vitest";
import {
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
  isSidebarOnlyWorkspacePath,
} from "@/lib/entryPageLayout";

describe("Activity Log full view", () => {
  it("hides the top menu, quick buttons and window tabs and fills the shell", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/audit-log")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/audit-log")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/audit-log")).toBe(true);
  });
});
