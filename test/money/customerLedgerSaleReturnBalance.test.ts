import { describe, expect, it } from "vitest";
import {
  allocateCnAdjustmentsToSaleReturns,
  saleReturnConsumedForRemaining,
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

describe("allocateCnAdjustmentsToSaleReturns — leftover on linked SRs", () => {
  it("Almas: CN on 3009 leftover applies after FIFO linked_sale_id points at 3064", () => {
    const map = allocateCnAdjustmentsToSaleReturns(
      [
        {
          id: "sr-153",
          net_amount: 8550,
          linked_sale_id: "inv-3064",
          return_date: "2026-09-09",
        },
      ],
      { "inv-3009": 4700, "inv-3064": 1800 },
      { "inv-3009": "INV/26-27/3009", "inv-3064": "INV/26-27/3064" },
    );
    expect(map["sr-153"].applied).toBe(6500);
  });
});

describe("saleReturnConsumedForRemaining", () => {
  it("Maseera: uses allocated ₹9,700, not full linked SRA ₹10,700", () => {
    expect(
      saleReturnConsumedForRemaining({
        allocatedAmount: 9_700,
        absorbedOnLinkedInvoice: 10_700,
      }),
    ).toBe(9_700);
    expect(
      saleReturnRemainingCredit({
        grossNetAmount: 13_850,
        consumedAmount: saleReturnConsumedForRemaining({
          allocatedAmount: 9_700,
          absorbedOnLinkedInvoice: 10_700,
        }),
      }),
    ).toBe(4_150);
  });

  it("billing-absorb / SHAHIN: no CN voucher → consume linked SRA so remaining is 0", () => {
    expect(
      saleReturnConsumedForRemaining({
        allocatedAmount: 0,
        absorbedOnLinkedInvoice: 2_000,
      }),
    ).toBe(2_000);
  });

  it("sibling took the CN receipts: allocated 0 but voucher total > 0 → consume 0", () => {
    expect(
      saleReturnConsumedForRemaining({
        allocatedAmount: 0,
        absorbedOnLinkedInvoice: 12_750,
        linkedSaleCnVoucherTotal: 12_750,
      }),
    ).toBe(0);
  });
});
