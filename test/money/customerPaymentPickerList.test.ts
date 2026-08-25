import { describe, expect, it } from "vitest";
import {
  mapPartyRowsToPaymentPicker,
  MIN_PAYMENT_PICKER_BALANCE,
} from "@/utils/customerPaymentPickerList";
import type { CustomerPartyBalanceAlignedRow } from "@/utils/customerPartyBalanceSnapshot";

describe("mapPartyRowsToPaymentPicker", () => {
  const base: CustomerPartyBalanceAlignedRow = {
    customer_id: "c1",
    customer_name: "SHAMIM BEGUM",
    signed_balance: 4800,
    advance_available: 0,
    direction: "Dr",
    net_position: 4800,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
    phone: "",
    gross_outstanding: 4800,
    cn_available: 0,
  };

  it("includes debtors at or above minimum balance", () => {
    const rows = mapPartyRowsToPaymentPicker([base], new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outstandingBalance).toBe(4800);
    expect(rows[0]!.customer_name).toBe("SHAMIM BEGUM");
  });

  it("excludes settled and credit customers below threshold", () => {
    const rows = mapPartyRowsToPaymentPicker(
      [
        { ...base, customer_id: "c2", signed_balance: 0.5, net_position: 0.5, gross_outstanding: 0.5 },
        {
          ...base,
          customer_id: "c3",
          signed_balance: -500,
          net_position: -500,
          gross_outstanding: 0,
          customer_name: "ADVANCE ONLY",
        },
      ],
      new Map(),
    );
    expect(rows).toHaveLength(0);
  });

  it("merges phone from org ledger reference map", () => {
    const byId = new Map([
      ["c1", { customer_name: "SHAMIM BEGUM", phone: "9876543210" }],
    ]);
    const rows = mapPartyRowsToPaymentPicker([base], byId);
    expect(rows[0]!.phone).toBe("9876543210");
  });

  it("respects MIN_PAYMENT_PICKER_BALANCE boundary", () => {
    expect(MIN_PAYMENT_PICKER_BALANCE).toBe(1);
    const rows = mapPartyRowsToPaymentPicker(
      [
        {
          ...base,
          signed_balance: MIN_PAYMENT_PICKER_BALANCE,
          net_position: MIN_PAYMENT_PICKER_BALANCE,
          gross_outstanding: MIN_PAYMENT_PICKER_BALANCE,
        },
      ],
      new Map(),
    );
    expect(rows).toHaveLength(1);
  });

  it("uses net_position (not gross_outstanding) for picker amount — matches C-JS banner", () => {
    const rows = mapPartyRowsToPaymentPicker(
      [
        {
          ...base,
          customer_id: "aafra",
          customer_name: "AAFRA",
          signed_balance: 4800,
          net_position: 4800,
          gross_outstanding: 14_800,
          advance_available: 10_000,
        },
      ],
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outstandingBalance).toBe(4800);
    expect(rows[0]!.outstandingBalance).not.toBe(14_800);
  });
});
