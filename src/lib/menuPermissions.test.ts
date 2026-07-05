import { describe, expect, it } from "vitest";
import {
  isMenuPermissionGranted,
  normalizeStoredMenuPermissions,
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
});
