import { describe, expect, it } from "vitest";
import {
  applyMenuFallbacksWhenUnset,
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

  it("requires explicit discount_scheme_dashboard grant (not implied by other sales rights)", () => {
    expect(
      isMenuPermissionGranted(
        { menu: { pos_sales: true }, mainMenu: { sales: true } },
        "discount_scheme_dashboard",
      ),
    ).toBe(false);
    expect(
      isMenuPermissionGranted(
        { menu: { discount_scheme_dashboard: true }, mainMenu: { sales: true } },
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

  it("gives Customer Reviews its own right, falling back to Sales Invoice Dashboard until saved", () => {
    expect(getMenuPermissionForPath("/customer-reviews")).toBe("customer_reviews");
    expect(getMenuPermissionForPath("/customer-notifications")).toBe("customer_notifications");
    const legacy = { menu: { sales_invoice_dashboard: true }, mainMenu: { sales: true } };
    expect(isMenuPermissionGranted(legacy, "customer_reviews")).toBe(true);
    expect(isMenuPermissionGranted(legacy, "customer_notifications")).toBe(true);
    const own = { menu: { sales_invoice_dashboard: false, customer_reviews: true }, mainMenu: {} };
    expect(isMenuPermissionGranted(own, "customer_reviews")).toBe(true);
    expect(isMenuPermissionGranted(own, "customer_notifications")).toBe(false);
    const off = { menu: { sales_invoice_dashboard: true, customer_reviews: false }, mainMenu: {} };
    expect(isMenuPermissionGranted(off, "customer_reviews")).toBe(false);
  });

  it("hides a report whose own box is unticked even when the older right is on", () => {
    const menu = {
      customer_ledger: true,
      accounts_dashboard: true,
      purchase_dashboard: true,
      sale_return_dashboard: true,
      accounting_reports_view: true,
      customer_party_balances: false,
      supplier_party_balances: false,
      customer_account_statement: false,
      customer_balance_activity: false,
      customer_audit_report: false,
      customer_points_report: false,
      payment_flow: false,
      cn_sr_adjustment_register: false,
      expense_salary_report: false,
    };
    const permissions = { menu, mainMenu: { reports: true } };
    for (const id of Object.keys(menu).filter((k) => menu[k as keyof typeof menu] === false)) {
      expect(isMenuPermissionGranted(permissions, id)).toBe(false);
    }
    expect(getMenuPermissionForPath("/payment-flow")).toBe("payment_flow");
    expect(getMenuPermissionForPath("/cn-sr-adjustment-register")).toBe("cn_sr_adjustment_register");
  });

  it("keeps older rights working for reports never saved, and User Rights shows the same", () => {
    const menu = { customer_ledger: true, sale_return: true };
    const permissions = { menu, mainMenu: { reports: true } };
    expect(isMenuPermissionGranted(permissions, "customer_party_balances")).toBe(true);
    expect(isMenuPermissionGranted(permissions, "customer_balance_activity")).toBe(true);
    expect(isMenuPermissionGranted(permissions, "payment_flow")).toBe(true);
    expect(isMenuPermissionGranted(permissions, "cn_sr_adjustment_register")).toBe(true);
    expect(isMenuPermissionGranted(permissions, "supplier_party_balances")).toBe(false);
    const shown = applyMenuFallbacksWhenUnset(menu);
    expect(shown.customer_party_balances).toBe(true);
    expect(shown.payment_flow).toBe(true);
    expect(shown.supplier_party_balances).toBe(false);
    expect(shown.customer_reviews).toBe(false);
  });
});
