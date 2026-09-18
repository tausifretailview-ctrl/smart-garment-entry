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
  gurukrupaInvoiceAccountLines,
  invoicePrintBalances,
  invoiceThisBillBalance,
} from "@/utils/invoiceAccountDue";

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
