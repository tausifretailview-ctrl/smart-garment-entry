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

    // Buggy path used remaining for both credit and running advance.
    const buggyRows = [
      { displayDebit: 10550, displayCredit: 0 },
      { displayDebit: 0, displayCredit: 10550 },
      { displayDebit: 0, displayCredit: grossReturn, credit: remaining },
      { displayDebit: 3200, displayCredit: 0 },
    ];
    // Column totals always sum display* → gap −3050 (3050 Cr).
    expect(walkLedgerSignedBalance(buggyRows)).toBe(-3050);

    // Running balance with gross advance (fixed):
    let running = 0;
    running += 10550;
    running -= 10550;
    running -= saleReturnRunningBalanceCredit(grossReturn);
    running += 3200;
    expect(running).toBe(-3050);
    expect(running).toBe(walkLedgerSignedBalance(buggyRows));

    // Old bug: advance by remaining only → +150 Dr while columns say 3050 Cr.
    let buggyRunning = 0;
    buggyRunning += 10550;
    buggyRunning -= 10550;
    buggyRunning -= remaining;
    buggyRunning += 3200;
    expect(buggyRunning).toBe(150);
    expect(buggyRunning).not.toBe(walkLedgerSignedBalance(buggyRows));
  });
});
