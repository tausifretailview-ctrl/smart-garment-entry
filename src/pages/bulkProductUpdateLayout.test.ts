import { describe, expect, it } from "vitest";
import {
  isFillHeightDashboardPath,
  isHideGlobalHeaderPath,
  isSidebarOnlyWorkspacePath,
} from "@/lib/entryPageLayout";

describe("Bulk Product Update full view", () => {
  it("hides the top menu, quick buttons and window tabs like Customer Balances", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/bulk-product-update")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/bulk-product-update")).toBe(true);
    expect(isFillHeightDashboardPath("/demo/bulk-product-update")).toBe(true);
  });

  it("does not catch the Products page or Product Entry", () => {
    expect(isSidebarOnlyWorkspacePath("/demo/product-entry")).toBe(false);
    expect(isSidebarOnlyWorkspacePath("/demo/bulk-product")).toBe(false);
  });
});
