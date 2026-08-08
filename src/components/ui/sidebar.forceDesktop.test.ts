import { describe, expect, it } from "vitest";

/**
 * Force-desktop on a phone must NOT use the sheet overlay sidebar.
 * Sheet covers the titlebar File/Edit/Sales menubar → "menu bar not visible".
 */
function resolveUseSheetSidebar(isMobile: boolean, forceDesktop: boolean): boolean {
  return isMobile && !forceDesktop;
}

describe("sidebar mode under Desktop view", () => {
  it("docks the sidebar when force-desktop is on (even on a phone)", () => {
    expect(resolveUseSheetSidebar(false, true)).toBe(false);
    // isMobile is false while force-desktop is enabled (see computeIsMobile)
    expect(resolveUseSheetSidebar(true, true)).toBe(false);
  });

  it("keeps sheet sidebar for true mobile chrome", () => {
    expect(resolveUseSheetSidebar(true, false)).toBe(true);
  });
});
