import { describe, expect, it } from "vitest";
import {
  summarizeThirdPartyBalances,
  thirdPartyBalanceDirection,
  type ThirdPartyBalanceRow,
} from "./thirdPartyBalances";

const row = (signedBalance: number, id = "a"): ThirdPartyBalanceRow => ({
  accountId: id,
  accountCode: "9101",
  accountName: "Test",
  accountGroup: "Sundry Creditors",
  accountType: "Liability",
  signedBalance,
});

describe("thirdPartyBalances helpers", () => {
  it("maps sign to Dr/Cr", () => {
    expect(thirdPartyBalanceDirection(15000)).toBe("Dr");
    expect(thirdPartyBalanceDirection(-500)).toBe("Cr");
    expect(thirdPartyBalanceDirection(0)).toBe("—");
  });

  it("summarizes total Dr / Cr / net", () => {
    const s = summarizeThirdPartyBalances([row(15000, "1"), row(-4000, "2"), row(0, "3")]);
    expect(s.totalDr).toBe(15000);
    expect(s.totalCr).toBe(4000);
    expect(s.net).toBe(11000);
  });
});
