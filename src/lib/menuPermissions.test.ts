import { describe, expect, it } from "vitest";
import {
  getMenuPermissionForPath,
  isMenuPermissionGranted,
  normalizeStoredMenuPermissions,
  resolveFirstAllowedPath,
  resolveMobileLandingPath,
} from "@/lib/menuPermissions";

describe("menuPermissions", () => {
  it("maps legacy delivery_challan to delivery_challan_entry", () => {
    const menu = normalizeStoredMenuPermissions({ delivery_challan: true });
    expect(menu.delivery_challan_entry).toBe(true);
    expect(
      isMenuPermissionGranted({ menu, mainMenu: { sales: true } }, "delivery_challan_entry"),
    ).toBe(true);
  });

  it("requires explicit enable when permissions object exists", () => {
    expect(
      isMenuPermissionGranted(
        { menu: { quotation_entry: true }, mainMenu: { sales: true } },
        "quotation_entry",
      ),
    ).toBe(true);
    expect(
      isMenuPermissionGranted(
        { menu: { quotation_entry: false }, mainMenu: { sales: true } },
        "quotation_entry",
      ),
    ).toBe(false);
  });

  it("maps website path to website_settings permission", () => {
    expect(getMenuPermissionForPath("website")).toBe("website_settings");
    expect(getMenuPermissionForPath("/website")).toBe("website_settings");
  });

  it("maps backup path to settings_view permission", () => {
    expect(getMenuPermissionForPath("backup")).toBe("settings_view");
    expect(getMenuPermissionForPath("/backup")).toBe("settings_view");
  });

  it("requires explicit website_settings grant (not implied by settings_view)", () => {
    expect(
      isMenuPermissionGranted({ menu: { settings_view: true }, mainMenu: { settings: true } }, "website_settings"),
    ).toBe(false);
    expect(
      isMenuPermissionGranted({ menu: { website_settings: true }, mainMenu: { settings: true } }, "website_settings"),
    ).toBe(true);
    expect(
      isMenuPermissionGranted({ menu: { website_settings: false }, mainMenu: { settings: true } }, "website_settings"),
    ).toBe(false);
  });

  it("enables discount_scheme_dashboard by default when the key was never saved", () => {
    expect(
      isMenuPermissionGranted(
        { menu: { pos_sales: true }, mainMenu: { sales: true } },
        "discount_scheme_dashboard",
      ),
    ).toBe(true);
    expect(
      isMenuPermissionGranted(
        { menu: { discount_scheme_dashboard: false }, mainMenu: { sales: true } },
        "discount_scheme_dashboard",
      ),
    ).toBe(false);
  });

  it("maps mobile-dashboard path to main_dashboard permission", () => {
    expect(getMenuPermissionForPath("mobile-dashboard")).toBe("main_dashboard");
    expect(getMenuPermissionForPath("/mobile-dashboard")).toBe("main_dashboard");
  });

  it("denies main_dashboard when User Rights hides it for manager", () => {
    const permissions = {
      menu: { main_dashboard: false, pos_sales: true },
      mainMenu: { dashboard: true, sales: true },
    };
    expect(isMenuPermissionGranted(permissions, "main_dashboard")).toBe(false);
  });

  it("resolveMobileLandingPath skips OwnerDashboard when main_dashboard is off", () => {
    const permissions = {
      menu: {
        main_dashboard: false,
        dashboard_view: true,
        pos_sales: true,
      },
      mainMenu: { dashboard: true, sales: true },
    };
    const hasMenuAccess = (id: string) => isMenuPermissionGranted(permissions, id);
    expect(resolveMobileLandingPath(hasMenuAccess, permissions, "manager")).toBe("pos-sales");
    expect(resolveFirstAllowedPath(hasMenuAccess, permissions, "manager")).toBe("pos-sales");
  });

  it("resolveMobileLandingPath keeps mobile-dashboard when main_dashboard is on", () => {
    const permissions = {
      menu: { main_dashboard: true },
      mainMenu: { dashboard: true },
    };
    const hasMenuAccess = (id: string) => isMenuPermissionGranted(permissions, id);
    expect(resolveMobileLandingPath(hasMenuAccess, permissions, "manager")).toBe(
      "mobile-dashboard",
    );
  });
});
