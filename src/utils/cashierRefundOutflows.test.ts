import { describe, expect, it } from "vitest";
import { cashierCashRefundOut } from "./cashierRefundOutflows";

describe("cashierCashRefundOut", () => {
  it("uses tracked cash refunds when present", () => {
    expect(
      cashierCashRefundOut({
        totalRefund: 1900,
        cashRefundTotal: 1700,
        customerRefundUpi: 200,
      }),
    ).toBe(1700);
  });

  it("infers cash from totalRefund minus non-cash when cash rows missing", () => {
    expect(
      cashierCashRefundOut({
        totalRefund: 1900,
        cashRefundTotal: 0,
        customerRefundUpi: 1700,
      }),
    ).toBe(200);
  });
});
