import { describe, expect, it } from "vitest";
import {
  creditNoteLiveRemaining,
  isSaleReturnConsumedAtBilling,
  resolveCnAvailableFromRows,
} from "@/utils/saleReturnCnBalance";

describe("isSaleReturnConsumedAtBilling", () => {
  it("is true when adjusted and linked to a sale", () => {
    expect(
      isSaleReturnConsumedAtBilling({
        credit_status: "adjusted",
        linked_sale_id: "sale-1",
      }),
    ).toBe(true);
  });

  it("is false for pending / partially_adjusted / unlinked adjusted", () => {
    expect(
      isSaleReturnConsumedAtBilling({ credit_status: "pending", linked_sale_id: null }),
    ).toBe(false);
    expect(
      isSaleReturnConsumedAtBilling({
        credit_status: "partially_adjusted",
        linked_sale_id: "sale-1",
      }),
    ).toBe(false);
    expect(
      isSaleReturnConsumedAtBilling({ credit_status: "adjusted", linked_sale_id: null }),
    ).toBe(false);
    expect(
      isSaleReturnConsumedAtBilling({
        credit_status: "adjusted_outstanding",
        linked_sale_id: "sale-1",
      }),
    ).toBe(false);
  });
});

describe("resolveCnAvailableFromRows with billing-consumed returns", () => {
  it("still reports CN live remaining (callers must gate with isSaleReturnConsumedAtBilling)", () => {
    const avail = resolveCnAvailableFromRows(
      { id: "sr-1", net_amount: 3000, credit_status: "adjusted", credit_note_id: "cn-1" },
      { id: "cn-1", credit_amount: 3000, used_amount: 0 },
    );
    expect(avail).toBe(3000);
    expect(creditNoteLiveRemaining({ id: "cn-1", credit_amount: 3000, used_amount: 3000 })).toBe(0);
  });
});
