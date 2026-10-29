import { describe, expect, it } from "vitest";
import { chatTapUserId, ownerAlertTapPath } from "./ownerAlertTap";

const SALE = "3f2b6c1e-8a4d-4b7e-9c11-0d2e5f6a7b8c";

describe("ownerAlertTapPath", () => {
  it("opens just the bill for a bill alert", () => {
    expect(ownerAlertTapPath({ route: "/pos-dashboard", sale_id: SALE })).toBe(`/owner-alert/bill/${SALE}`);
    expect(ownerAlertTapPath({ route: `/owner-alert/bill/${SALE}`, sale_id: SALE })).toBe(`/owner-alert/bill/${SALE}`);
  });

  it("opens the colour report for cashier, day-end and test alerts", () => {
    expect(ownerAlertTapPath({ route: "/pos-dashboard" })).toBe("/owner-alert/report");
    expect(ownerAlertTapPath({ route: "/daily-cashier-report" })).toBe("/owner-alert/report");
    expect(ownerAlertTapPath({ route: "/owner-alert/report?date=2026-10-13" })).toBe("/owner-alert/report?date=2026-10-13");
  });

  it("keeps other screens", () => {
    expect(ownerAlertTapPath({ route: "/stock-report?status=low" })).toBe("/stock-report?status=low");
    expect(ownerAlertTapPath({ route: "/customer-reviews" })).toBe("/customer-reviews");
  });

  it("ignores bad data", () => {
    expect(ownerAlertTapPath(undefined)).toBeNull();
    expect(ownerAlertTapPath({ route: "https://evil.example" })).toBeNull();
    expect(ownerAlertTapPath({ route: "//evil.example" })).toBeNull();
    expect(ownerAlertTapPath({ route: "/pos-dashboard", sale_id: "x" })).toBe("/owner-alert/report");
  });
});

describe("chatTapUserId", () => {
  it("returns the sender for an in-shop chat push", () => {
    expect(chatTapUserId({ kind: "team_chat", chat_user_id: SALE, route: "/" })).toBe(SALE);
  });

  it("ignores other alerts and bad ids", () => {
    expect(chatTapUserId({ route: "/customer-reviews" })).toBeNull();
    expect(chatTapUserId({ kind: "team_chat", chat_user_id: "x" })).toBeNull();
    expect(chatTapUserId(undefined)).toBeNull();
  });
});
