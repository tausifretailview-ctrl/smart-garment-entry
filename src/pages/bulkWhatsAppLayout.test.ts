import { describe, expect, it } from "vitest";
import {
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
  isSidebarOnlyWorkspacePath,
} from "@/lib/entryPageLayout";

describe("Bulk WhatsApp full view", () => {
  it("hides the top menu and window tabs and fills the shell", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/bulk-whatsapp")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/bulk-whatsapp")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/bulk-whatsapp")).toBe(true);
  });
});
