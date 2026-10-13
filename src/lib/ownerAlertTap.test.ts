import { describe, expect, it } from "vitest";
import { ownerAlertTapTarget } from "./ownerAlertTap";

const SALE = "3f2b6c1e-8a4d-4b7e-9c11-0d2e5f6a7b8c";

describe("ownerAlertTapTarget", () => {
  it("opens the bill for an invoice alert", () => {
    expect(ownerAlertTapTarget({ route: "/pos-dashboard", sale_id: SALE })).toEqual({ saleId: SALE });
  });

  it("opens the cashier report for cashier, day-end and test alerts", () => {
    expect(ownerAlertTapTarget({ route: "/pos-dashboard" })).toEqual({ path: "/daily-cashier-report" });
  });

  it("keeps other screens", () => {
    expect(ownerAlertTapTarget({ route: "/stock-report?status=low" })).toEqual({ path: "/stock-report?status=low" });
    expect(ownerAlertTapTarget({ route: "/customer-reviews" })).toEqual({ path: "/customer-reviews" });
  });

  it("ignores bad data", () => {
    expect(ownerAlertTapTarget(undefined)).toBeNull();
    expect(ownerAlertTapTarget({ route: "https://evil.example" })).toBeNull();
    expect(ownerAlertTapTarget({ route: "//evil.example" })).toBeNull();
    expect(ownerAlertTapTarget({ route: "/pos-dashboard", sale_id: "x" })).toEqual({ path: "/daily-cashier-report" });
  });
});
