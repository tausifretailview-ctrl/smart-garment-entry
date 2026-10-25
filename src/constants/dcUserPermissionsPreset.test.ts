import { describe, expect, it } from "vitest";
import { isMenuPermissionGranted } from "@/lib/menuPermissions";
import { DC_USER_PERMISSIONS_PRESET, isDcUserPermissions } from "./dcUserPermissionsPreset";

describe("DC User permissions preset", () => {
  it("marks the login as DC User", () => {
    expect(isDcUserPermissions(DC_USER_PERMISSIONS_PRESET)).toBe(true);
    expect(isDcUserPermissions({ special: { dc_only: false } })).toBe(false);
    expect(isDcUserPermissions(null)).toBe(false);
  });

  it("opens DC purchase, stock, sale and report screens only", () => {
    const can = (id: string) => isMenuPermissionGranted(DC_USER_PERMISSIONS_PRESET, id);
    for (const id of ["purchase_bill", "purchase_dashboard", "stock_report", "pos_dashboard", "item_wise_sales", "main_dashboard"]) {
      expect(can(id)).toBe(true);
    }
    for (const id of ["pos_sales", "sales_invoice", "gst_reports", "customer_party_balances", "customer_reviews", "user_rights", "accounts_dashboard", "settings_view"]) {
      expect(can(id)).toBe(false);
    }
    expect(DC_USER_PERMISSIONS_PRESET.special.ai_chatbot).toBe(false);
  });
});
