import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

// Maps each page path → where Esc should go
// Tally-style: entry pages go to their dashboard, dashboards go to home
const BACK_MAP: Record<string, string> = {
  // Sale entry → Sale Invoice Dashboard
  "sales-invoice":            "sales-invoice-dashboard",
  "sale-return-entry":        "sales-invoice-dashboard",
  // POS entry → POS Dashboard
  "pos-sales":                "pos-dashboard",
  // Purchase → Purchase Dashboard
  "purchase-entry":           "purchase-bills",
  "purchase-return-entry":    "purchase-bills",
  "purchase-order-entry":     "purchase-orders",
  // Products
  "product-entry":            "products",
  "bulk-product-update":      "products",
  // Quotation
  "quotation-entry":          "quotation-dashboard",
  "sale-order-entry":         "sale-order-dashboard",
  // Delivery Challan
  "delivery-challan-entry":   "delivery-challan-dashboard",
  // Reports → Dashboard
  "stock-report":             "/",
  "stock-adjustment":         "stock-report",
  "stock-settlement":         "stock-report",
  "stock-ageing":             "stock-report",
  "item-wise-sales":          "/",
  "item-wise-stock":          "/",
  "daily-tally":              "/",
  "daily-cashier-report":     "/",
  "daily-sale-analysis":      "/",
  "hourly-sales-analysis":    "/",
  "gst-reports":              "/",
  "gst-register":             "/",
  "einvoice-report":          "sales-invoice-dashboard",
  "tally-export":             "/",
  "sales-analytics":          "/",
  "accounting-reports":       "/",
  "net-profit-analysis":      "/",
  "customer-ledger-report":   "accounts",
  "stock-analysis":           "/",
  "price-history":            "/",
  "product-tracking":         "/",
  "purchase-report":          "/",
  "sales-report":             "/",
  "salesman-commission":      "/",
  "expense-salary-report":    "/",
  "customer-account-statement":       "/",
  "customer-account-statement-audit": "/",
  "customer-balance-activity":        "/",
  "customer-audit-report":            "/",
  // Masters
  "customers":                "/",
  "suppliers":                "/",
  "employees":                "/",
  // Settings / Tools → Dashboard
  "settings":                 "/",
  "profile":                  "/",
  "organization-management":  "/",
  "health":                   "/",
  "barcode-printing":         "/",
  "user-rights":              "/",
  "audit-log":                "/",
  "recycle-bin":              "/",
  "delivery-dashboard":       "/",
  "payments-dashboard":       "/",
  "customer-reconciliation":  "customers",
  "whatsapp-inbox":           "/",
  "whatsapp-logs":            "/",
  // Dashboards → Home
  "pos-dashboard":            "/",
  "sales-invoice-dashboard":  "/",
  "purchase-bills":           "/",
  "accounts":                 "/",
  "quotation-dashboard":      "/",
  "sale-order-dashboard":     "/",
  "products":                 "/",
  "advance-bookings":         "/",
  "sale-returns":               "/",
  "sale-return-dashboard":    "/",
  "purchase-return-dashboard": "/",
  "purchase-orders":          "/",
  "purchase-returns":         "/",
  "advance-booking-dashboard": "/",
  "delivery-challan-dashboard": "/",
  // School
  "fee-collection":           "/",
  "students":                 "/",
  "student-entry":            "students",
  "student-ledger":           "fee-collection",
  "student-reports":          "students",
  "student-promotion":        "students",
  "fee-structures":           "/",
  "fee-heads":                "/",
  "classes":                  "/",
  "academic-years":           "/",
  "teachers":                 "/",
  // Accounting sub-pages → Accounts
  "chart-of-accounts":        "accounts",
  "journal-vouchers":         "accounts",
  "manual-journal":           "accounts",
  "ledger-opening-balances":  "accounts",
  // Mobile / Owner screens → Home
  "mobile-dashboard":         "/",
  "mobile-sales":             "/",
  "mobile-accounts":          "/",
  "mobile-more":              "/",
  "owner-sales":              "/",
  "owner-purchases":          "/",
  "owner-stock":              "/",
  "owner-reports":            "/",
};

export const useEscapeBack = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgNavigate, orgSlug } = useOrgNavigation();

  const handleEscape = useCallback(() => {
    // Get the last path segment
    const pathParts = location.pathname.split("/").filter(Boolean);
    const currentPage = pathParts[pathParts.length - 1] || "";

    // Check if current page is root / org home → do nothing
    if (!currentPage || currentPage === orgSlug) return;

    // Look up smart back destination
    const destination = BACK_MAP[currentPage];

    if (destination === "/") {
      orgNavigate("/");
    } else if (destination) {
      orgNavigate("/" + destination);
    } else {
      // Fallback: browser back
      navigate(-1);
    }
  }, [navigate, location.pathname, orgNavigate, orgSlug]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;

      // Don't fire when focus is inside a text input
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      // Don't fire when a dialog, popover, or dropdown is open
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], ' +
          '[data-radix-popper-content-wrapper], ' +
          '[data-state="open"][role="menu"], ' +
          '[data-state="open"][role="listbox"]'
        )
      ) return;

      e.preventDefault();
      handleEscape();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleEscape]);

  return { handleEscape };
};
