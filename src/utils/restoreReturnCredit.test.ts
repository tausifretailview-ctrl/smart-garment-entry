import { describe, expect, it } from "vitest";
import { restoredReturnCredit } from "./restoreReturnCredit";

describe("credit restored on cancel, delete, and edit", () => {
  it("a partly used ₹500 note gives back only the unused ₹250", () => {
    expect(restoredReturnCredit({
      returnNet: 500,
      creditAmount: 500,
      usedAmountAfterRelease: 250,
    })).toEqual({ balance: 250, status: "partially_adjusted" });
  });

  it("releasing the only use restores the full note", () => {
    expect(restoredReturnCredit({
      returnNet: 500,
      creditAmount: 500,
      usedAmountAfterRelease: 0,
    })).toEqual({ balance: 500, status: "pending" });
  });

  it("a note still fully used elsewhere stays adjusted", () => {
    expect(restoredReturnCredit({
      returnNet: 500,
      creditAmount: 500,
      usedAmountAfterRelease: 500,
    })).toEqual({ balance: 0, status: "adjusted" });
  });
});
