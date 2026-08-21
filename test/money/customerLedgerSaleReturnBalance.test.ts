import { describe, expect, it } from "vitest";
import {
  saleReturnRemainingCredit,
  saleReturnRunningBalanceCredit,
  walkLedgerSignedBalance,
} from "@/utils/customerLedgerSaleReturnBalance";

describe("saleReturnRunningBalanceCredit", () => {
  it("uses gross return amount, not remaining after CN apply", () => {
    expect(saleReturnRunningBalanceCredit(6250)).toBe(6250);
    expect(saleReturnRemainingCredit({ grossNetAmount: 6250, consumedAmount: 3200 })).toBe(3050);
  });
});

describe("Hanif bhai — running balance vs column totals", () => {
  it("last signed balance equals Dr−Cr column gap when return advances by gross", () => {
    const grossReturn = 6250;
    const appliedCn = 3200;
    const remaining = saleReturnRemainingCredit({
      grossNetAmount: grossReturn,
      consumedAmount: appliedCn,
    });

    const rows = [
      { displayDebit: 10550, displayCredit: 0 },
      { displayDebit: 0, displayCredit: 10550 },
      { displayDebit: 0, displayCredit: grossReturn, credit: remaining },
      { displayDebit: 3200, displayCredit: 0 },
    ];
    expect(walkLedgerSignedBalance(rows)).toBe(-3050);

    let running = 0;
    running += 10550;
    running -= 10550;
    running -= saleReturnRunningBalanceCredit(grossReturn);
    running += 3200;
    expect(running).toBe(-3050);

    // Recon must use gross return (6250), not remaining (3050).
    const grossInvoiced = 10550 + 3200;
    const paymentsCash = 10550;
    const saleReturnsGross = grossReturn;
    const outstanding = grossInvoiced - saleReturnsGross - paymentsCash;
    expect(outstanding).toBe(-3050);
    expect(outstanding).toBe(running);

    const buggyOutstanding = grossInvoiced - remaining - paymentsCash;
    expect(buggyOutstanding).toBe(150);
  });
});
