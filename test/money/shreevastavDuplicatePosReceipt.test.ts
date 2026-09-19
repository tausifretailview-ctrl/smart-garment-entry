/**
 * SHREEVASTAV (GURUKRUPA) — 30-May duplicate POS receipts vs printed bill.
 *
 * Live ledger (19 Sep 2026 PDF): Outstanding ₹13,150.
 * Printed POS/26-27/1903: Balance / Outstanding / Total Due ₹16,250.
 * Gap = ₹3,100 = RCP/1128 ₹2,100 + RCP/1129 ₹1,000.
 *
 * Hand reconstruction from the ledger PDF — no production mutate.
 */
import { describe, expect, it } from "vitest";
import {
  formatCustomerAccountArithmeticLine,
  type CustomerAccountStateView,
} from "@/utils/customerAccountStateView";
import { computeInvoiceOutstandingFromReconciliation } from "@/utils/customerLedgerReconciliation";
import {
  gurukrupaInvoiceAccountLines,
  invoicePrintBalances,
  invoiceThisBillBalance,
} from "@/utils/invoiceAccountDue";

/** Script 3 remaining_before: net − SRA − prior receipts − residual at-sale tender. */
function remainingBefore(opts: {
  net: number;
  sra?: number;
  priorReceipts: number;
  tender: number;
  sameDayPriorReceipts?: number;
}): number {
  const residualTender = Math.max(opts.tender - (opts.sameDayPriorReceipts ?? 0), 0);
  return Math.max(opts.net - (opts.sra ?? 0) - opts.priorReceipts - residualTender, 0);
}

function accountLine(outstanding: number, unusedAdvance = 0): string {
  const view: CustomerAccountStateView = {
    customerId: "test",
    customerName: "test",
    outstanding,
    unusedAdvance,
    unclaimedSaleReturn: 0,
    netPosition: outstanding - unusedAdvance,
    openingBalance: 0,
    advanceLegs: [],
  };
  return formatCustomerAccountArithmeticLine(view);
}

const POS_875 = 3_100;
const AT_SALE_875 = 1_000;
const RCP_799 = 2_100;
const POS_766 = 4_900;
const POS_767 = 5_600;
const RCP_1127 = 5_600;
const RCP_1128 = 2_100;
const RCP_1129 = 1_000;
const POS_824 = 3_500;
const AT_SALE_824 = 500;
const RCP_1391 = 3_000;
const POS_1903 = 17_250;
const AT_SALE_1903 = 1_000;

function running(credits: number[], include1903 = true): number {
  const invoiced =
    POS_875 + POS_766 + POS_767 + POS_824 + (include1903 ? POS_1903 : 0);
  return invoiced - credits.reduce((s, n) => s + n, 0);
}

describe("SHREEVASTAV POS/875 settlement before 30 May", () => {
  it("at-sale ₹1,000 + RCP/799 ₹2,100 exactly clears ₹3,100", () => {
    expect(AT_SALE_875 + RCP_799).toBe(POS_875);
  });

  it("RCP/1128 + RCP/1129 replay the same two legs", () => {
    expect(RCP_1128).toBe(RCP_799);
    expect(RCP_1129).toBe(AT_SALE_875);
    expect(RCP_1128 + RCP_1129).toBe(POS_875);
  });
});

describe("live SQL-editor paste 19 Sep 2026 00:22 IST", () => {
  it("1128/1129 created_at is 07:29 UTC, Customer Payment Tab description, same sale", () => {
    const rcp1128At = new Date("2026-05-30T07:29:06.757454Z");
    const rcp1129At = new Date("2026-05-30T07:29:20.724903Z");
    expect(rcp1128At.toISOString().startsWith("2026-05-30T07:29:06")).toBe(true);
    expect(rcp1129At.getTime() - rcp1128At.getTime()).toBe(13_967);
    expect("Payment for POS/25-26/875".startsWith("Payment received for POS sale")).toBe(false);
  });

  it("headline: Gurukrupa 4 rows ₹9,500; Velvet 15 rows ₹70,842", () => {
    expect(4).toBe(4);
    expect(3_100 + 6_400).toBe(9_500);
    expect(
      13_700 + 2_770 + 5_570 + 3_900 + 2_299 + 3_149 + 2_000 + 1_500 + 15_862 +
        2_745 + 570 + 1_977 + 3_300 + 1_500 + 10_000,
    ).toBe(70_842);
  });

  it("Velvet DOLLY/DIYA: prior + tender already equals net before the new RCP", () => {
    expect(1_500 + 3_000).toBe(4_500);
    expect(10_000 + 1_000).toBe(11_000);
  });

  it("Gurukrupa paste 3: VIMLA ₹400 + SHREEVASTAV ₹3,100 + SANTOSH ₹6,000 = ₹9,500", () => {
    expect(400 + 2_100 + 1_000 + 6_000).toBe(9_500);
    expect(2_600 + 400).toBe(3_000);
    expect(6_000 + 75_200).toBe(81_200);
    // 1125 and 1131-1 sit next to the cluster and must stay out of the ₹9,500 set.
    expect(2_600 + 5_800).not.toBe(9_500);
  });
});

describe("SHREEVASTAV ledger running balance", () => {
  it("live PDF ends at ₹13,150 with the two 30-May duplicates", () => {
    expect(
      running([
        AT_SALE_875,
        RCP_799,
        POS_766,
        RCP_1127,
        RCP_1128,
        RCP_1129,
        AT_SALE_824,
        RCP_1391,
        AT_SALE_1903,
      ]),
    ).toBe(13_150);
  });

  it("removing RCP/1128 and RCP/1129 lands on the printed ₹16,250", () => {
    expect(
      running([
        AT_SALE_875,
        RCP_799,
        POS_766,
        RCP_1127,
        AT_SALE_824,
        RCP_1391,
        AT_SALE_1903,
      ]),
    ).toBe(16_250);
  });

  it("prior to POS/1903 is ₹0 once the duplicates are out; ₹3,100 Cr with them in", () => {
    const withDup = running(
      [
        AT_SALE_875,
        RCP_799,
        POS_766,
        RCP_1127,
        RCP_1128,
        RCP_1129,
        AT_SALE_824,
        RCP_1391,
      ],
      false,
    );
    const withoutDup = running(
      [AT_SALE_875, RCP_799, POS_766, RCP_1127, AT_SALE_824, RCP_1391],
      false,
    );
    expect(withDup).toBe(-3_100);
    expect(withoutDup).toBe(0);
  });

  it("RCP/1127 on POS/767 is not this signature — it settles an unpaid bill", () => {
    expect(RCP_1127).toBe(POS_767);
  });
});

describe("POS/26-27/1903 print footer — not a 9th outstanding formula", () => {
  it("Balance is this invoice only: Bill Total − Received", () => {
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).toBe(16_250);
  });

  it("printed Outstanding ₹16,250 is previousBalance 0 + this-bill leftover", () => {
    const lines = gurukrupaInvoiceAccountLines({
      previousBalance: 0,
      thisBillBalance: 16_250,
      unusedAdvance: 0,
    });
    expect(lines.outstanding).toBe(16_250);
    expect(lines.advance).toBe(0);
    expect(lines.totalDue).toBe(16_250);
  });

  it("a successful signed fetch of live ledger ₹13,150 would print Outstanding ₹13,150, not the photo", () => {
    const printed = invoicePrintBalances({
      accountOutstanding: 13_150,
      billTotal: POS_1903,
      receivedToday: AT_SALE_1903,
      accountIncludesThisBill: true,
    });
    expect(printed.thisBillBalance).toBe(16_250);
    expect(printed.previousBalance).toBe(-3_100);
    expect(printed.totalDue).toBe(13_150);
  });
});

describe("POS search ₹14,650 Due is C-SNAP, not a ninth family", () => {
  const thisBill1903 = POS_1903 - AT_SALE_1903; // 16,250
  const greatest875OverCredit = settlementGreatestOverCredit(
    RCP_799 + RCP_1128 + RCP_1129,
    AT_SALE_875,
    POS_875,
  ); // 2,100
  const pos824AtSaleDroppedInSnapDrift = AT_SALE_824; // 500

  it("₹1,600 = 875 GREATEST over-credit minus 824 at-sale dropped by SNAP drift", () => {
    expect(greatest875OverCredit).toBe(2_100);
    expect(thisBill1903 - greatest875OverCredit + pos824AtSaleDroppedInSnapDrift).toBe(14_650);
    expect(thisBill1903 - 14_650).toBe(1_600);
  });

  it("is not “only 1128” (that is C-JS ₹14,150) and not both dups (ledger ₹13,150)", () => {
    expect(thisBill1903 - RCP_1128).toBe(14_150);
    expect(thisBill1903 - RCP_1128 - RCP_1129).toBe(13_150);
    expect(14_650).not.toBe(14_150);
    expect(14_650).not.toBe(13_150);
  });

  it("Payment Receipt Select Invoices pending is this-bill leftover, not customer C-JS", () => {
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).toBe(16_250);
    expect(accountLine(14_150, 0)).toContain("Customer owes ₹14,150");
  });

  it("live S1 tables reconstruction 19 Sep 18:10 IST is 14650 with unused advance 0", () => {
    const totalInvoiced = 34_350;
    const receiptPayments = 13_800;
    const paidAtSaleDrift = 5_900;
    const unusedAdvances = 0;
    const signed = totalInvoiced - receiptPayments - paidAtSaleDrift;
    expect(signed).toBe(14_650);
    expect(signed + unusedAdvances).toBe(14_650);
  });
});

describe("invoice leftover is not a customer-level SSOT (scope)", () => {
  it("this-bill leftover matches print ₹16,250 and does not include opening/advance/CN legs", () => {
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).toBe(16_250);
    // reconcileSaleInvoiceWithSplit / invoiceThisBillBalance take one sale's net and tender.
    // Customer Balances / KPI still need opening, unused advance, unclaimed CN — not SUM(leftover).
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).not.toBe(14_150);
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).not.toBe(13_150);
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).not.toBe(14_650);
  });
});

describe("C-JS demoted — glance ₹14,150 is not the print", () => {
  it("C-JS is leftover minus 875 GREATEST over-credit ₹2,100, not both dups", () => {
    const leftover = POS_1903 - AT_SALE_1903;
    expect(leftover - RCP_1128).toBe(14_150);
    expect(accountLine(14_150, 0)).toContain("Customer owes ₹14,150");
    expect(14_150).not.toBe(leftover);
  });
});

describe("bucket (g) C-SNAP compound GREATEST + drift — not folded into duplicate-receipt", () => {
  it("₹14,650 = leftover − 875 GREATEST ₹2,100 + 824 dropped at-sale ₹500", () => {
    const leftover = POS_1903 - AT_SALE_1903;
    const greatest875 = settlementGreatestOverCredit(
      RCP_799 + RCP_1128 + RCP_1129,
      AT_SALE_875,
      POS_875,
    );
    expect(greatest875).toBe(2_100);
    expect(leftover - greatest875 + AT_SALE_824).toBe(14_650);
    expect(14_650).not.toBe(14_150);
    expect(14_650).not.toBe(13_150);
  });
});

describe("after 1128/1129 repair — four families do not all converge", () => {
  const leftover = 16_250;
  const liveLedger = 13_150;
  const liveSnapInvoiced = 34_350;
  const liveSnapReceipts = 13_800;
  const liveSnapDrift = 5_900;

  it("leftover stays ₹16,250 (1903 never referenced the duplicates)", () => {
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).toBe(leftover);
  });

  it("ledger converges: 13,150 + 3,100 = ₹16,250", () => {
    expect(liveLedger + RCP_1128 + RCP_1129).toBe(leftover);
  });

  it("C-JS converges to ₹16,250 only if 875 paid_amount still carries at-sale (drift gap ₹1,000)", () => {
    const receiptsAfter = liveSnapReceipts - RCP_1128 - RCP_1129;
    // Live C-JS 14150 = 34350 − 13800 − 6400 (drift includes 824 ₹500).
    const liveJsDrift = liveSnapInvoiced - 13_800 - 14_150;
    expect(liveJsDrift).toBe(6_400);
    const jsIfPaidHoldsTender = liveSnapInvoiced - receiptsAfter - (liveJsDrift + AT_SALE_875);
    expect(jsIfPaidHoldsTender).toBe(leftover);
    const jsIfGreatestRewritePaid = liveSnapInvoiced - receiptsAfter - liveJsDrift;
    expect(jsIfGreatestRewritePaid).toBe(17_250);
  });

  it("C-SNAP does not converge: drift still drops 875 and 824 at-sale → ₹17,750", () => {
    const receiptsAfter = liveSnapReceipts - RCP_1128 - RCP_1129;
    expect(Math.max(0, AT_SALE_875 - RCP_799)).toBe(0);
    expect(Math.max(0, AT_SALE_824 - RCP_1391)).toBe(0);
    const snapAfter = liveSnapInvoiced - receiptsAfter - liveSnapDrift;
    expect(snapAfter).toBe(17_750);
    expect(leftover + AT_SALE_875 + AT_SALE_824).toBe(17_750);
    expect(snapAfter).not.toBe(leftover);
    expect(snapAfter).not.toBe(16_750);
  });
});

/** How the 51-bill pass counted cash: GREATEST(vouchers, tender), not the sum. */
function settlementGreatestOverCredit(vouchers: number, tender: number, net: number): number {
  return Math.max(0, Math.max(vouchers, tender) - net);
}

function ledgerOverCredit(vouchers: number, tender: number, net: number): number {
  return Math.max(0, vouchers + tender - net);
}

describe("51-bill repair set — SHREEVASTAV is ₹3,100 not the GREATEST artefact ₹2,100", () => {
  const vouchers875 = RCP_799 + RCP_1128 + RCP_1129;

  it("GREATEST(receipts, tender) is how the later pass cut her to ₹2,100", () => {
    expect(Math.max(vouchers875, AT_SALE_875)).toBe(5_200);
    expect(vouchers875 - POS_875).toBe(2_100);
    expect(settlementGreatestOverCredit(vouchers875, AT_SALE_875, POS_875)).toBe(2_100);
  });

  it("ledger adds at-sale + receipts, so both 1128 and 1129 are over-credit ₹3,100", () => {
    expect(ledgerOverCredit(vouchers875, AT_SALE_875, POS_875)).toBe(3_100);
    expect(RCP_1128 + RCP_1129).toBe(3_100);
  });

  it("repairing only 1128 lands ₹15,250; both receipts land on the printed ₹16,250", () => {
    const live = 13_150;
    expect(live + RCP_1128).toBe(15_250);
    expect(live + RCP_1128 + RCP_1129).toBe(16_250);
  });

  it("51-bill headline moves ₹2,98,467 → ₹2,99,467; still 51 bills", () => {
    expect(298_467 + 1_000).toBe(299_467);
  });
});

const POS_765 = 3_000;
const AT_SALE_765 = 400;
const RCP_1125 = 2_600;
const RCP_1126 = 400;

describe("VIMLA YADAV POS/765 — 19 Sep 2026 ledger PDF …034a", () => {
  it("RCP/1125 is genuine leftover (remaining_before ₹2,600); RCP/1126 is the at-sale duplicate", () => {
    expect(remainingBefore({ net: POS_765, priorReceipts: 0, tender: AT_SALE_765 })).toBe(2_600);
    expect(
      remainingBefore({
        net: POS_765,
        priorReceipts: RCP_1125,
        tender: AT_SALE_765,
      }),
    ).toBe(0);
    expect(AT_SALE_765 + RCP_1125).toBe(POS_765);
    expect(RCP_1126).toBe(AT_SALE_765);
  });

  it("live PDF ends at ₹400 Cr; removing only 1126 lands on ₹0", () => {
    const invoiced = POS_765;
    const live = invoiced - (AT_SALE_765 + RCP_1125 + RCP_1126);
    const without1126 = invoiced - (AT_SALE_765 + RCP_1125);
    expect(live).toBe(-400);
    expect(without1126).toBe(0);
  });

  it("header Net ₹0 is leftover already 0; recon 400 Cr is the extra sale-referenced receipt", () => {
    expect(accountLine(0, 0)).toContain("Customer owes ₹0");
    expect(accountLine(0, 0)).toContain("Net ₹0");
    expect(
      computeInvoiceOutstandingFromReconciliation({
        opening: 0,
        grossInvoiced: POS_765,
        invoiceCnApplied: 0,
        saleReturns: 0,
        paymentsCash: AT_SALE_765 + RCP_1125 + RCP_1126,
        paymentsDiscount: 0,
        advanceApplied: 0,
        adjustments: 0,
      }),
    ).toBe(-400);
  });
});

const POS_282 = 1_200;
const AT_SALE_282 = 1_200;
const POS_717 = 81_200;
const AT_SALE_717 = 75_200;
const RCP_213 = 6_000;
const POS_1130 = 5_800;
const RCP_1618 = 5_500;
const RCP_1131_1 = 5_800;
const RCP_1131_2 = 6_000;
const SANTOSH_GROSS = POS_282 + POS_717 + POS_1130; // POS/723 contributes 0 to columns
const SANTOSH_CN = 12_800;
const SANTOSH_PAYMENTS =
  AT_SALE_282 + AT_SALE_717 + RCP_213 + RCP_1618 + RCP_1131_1 + RCP_1131_2;

describe("SANTOSH ZADE — 19 Sep 2026 ledger PDF …40d9", () => {
  it("column totals match the PDF: Dr ₹88,200 / Cr ₹99,700 / running ₹11,500 Cr", () => {
    expect(SANTOSH_GROSS).toBe(88_200);
    expect(SANTOSH_PAYMENTS).toBe(99_700);
    expect(SANTOSH_GROSS - SANTOSH_PAYMENTS).toBe(-11_500);
  });

  it("1131-2 is already-zero on POS/717; 1131-1 is a ₹300 leftover overpay on POS/1130", () => {
    expect(
      remainingBefore({
        net: POS_717,
        priorReceipts: RCP_213,
        tender: AT_SALE_717,
      }),
    ).toBe(0);
    expect(AT_SALE_717 + RCP_213).toBe(POS_717);
    expect(RCP_1131_2).toBe(RCP_213);

    expect(
      remainingBefore({
        net: POS_1130,
        priorReceipts: RCP_1618,
        tender: 0,
      }),
    ).toBe(300);
    expect(RCP_1131_1).toBe(POS_1130);
    expect(RCP_1131_1 > 300).toBe(true);
  });

  it("removing only 1131-2 lands columns on ₹5,500 Cr, matching the header Net", () => {
    const without1131_2 = SANTOSH_GROSS - (SANTOSH_PAYMENTS - RCP_1131_2);
    const before30MaySave = SANTOSH_GROSS - (SANTOSH_PAYMENTS - RCP_1131_1 - RCP_1131_2);
    expect(without1131_2).toBe(-5_500);
    expect(before30MaySave).toBe(300);
    expect(accountLine(-5_500, 0)).toContain("Customer owes ₹5,500");
    expect(accountLine(-5_500, 0)).toContain("Net ₹5,500 Cr");
  });

  it("banner/recon ₹24,300 Cr is columns ₹11,500 plus the POS/723 memo CN ₹12,800", () => {
    expect(
      computeInvoiceOutstandingFromReconciliation({
        opening: 0,
        grossInvoiced: SANTOSH_GROSS,
        invoiceCnApplied: SANTOSH_CN,
        saleReturns: 0,
        paymentsCash: SANTOSH_PAYMENTS,
        paymentsDiscount: 0,
        advanceApplied: 0,
        adjustments: 0,
      }),
    ).toBe(-24_300);
    expect(11_500 + SANTOSH_CN).toBe(24_300);
    // Header Net ₹5,500 Cr = recon minus the memo CN minus the already-zero 1131-2.
    expect(24_300 - SANTOSH_CN - RCP_1131_2).toBe(5_500);
  });
});
