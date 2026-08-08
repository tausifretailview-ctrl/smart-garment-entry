import { afterEach, describe, expect, it, vi } from "vitest";
import { FORCE_DESKTOP_VIEW_KEY } from "@/lib/desktopViewPreference";

/**
 * Mirrors computeIsNarrowViewport logic for unit coverage without mounting React.
 * Force-desktop sets meta viewport width=1280, so layout innerWidth must NOT be trusted.
 */
function computeIsNarrowViewportForTest(
  forced: boolean,
  innerWidth: number,
  screenWidth: number,
  screenHeight: number,
  breakpoint = 768,
): boolean {
  if (forced) {
    return Math.min(screenWidth, screenHeight) < breakpoint;
  }
  return innerWidth < breakpoint;
}

describe("narrow viewport under force-desktop (PWA escape hatch)", () => {
  afterEach(() => {
    try {
      localStorage.removeItem(FORCE_DESKTOP_VIEW_KEY);
    } catch {
      /* ignore */
    }
  });

  it("uses physical screen size when force-desktop makes layout viewport 1280", () => {
    // Phone PWA after Desktop view: layout looks wide, screen stays phone-sized
    expect(
      computeIsNarrowViewportForTest(true, 1280, 390, 844),
    ).toBe(true);
  });

  it("stays false on a real wide desktop even with force-desktop flag", () => {
    expect(
      computeIsNarrowViewportForTest(true, 1440, 1440, 900),
    ).toBe(false);
  });

  it("uses layout width when force-desktop is off", () => {
    expect(computeIsNarrowViewportForTest(false, 390, 390, 844)).toBe(true);
    expect(computeIsNarrowViewportForTest(false, 1280, 390, 844)).toBe(false);
  });
});
