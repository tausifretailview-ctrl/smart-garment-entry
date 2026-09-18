/**
 * MASEERA (ELLA NOOR) — Phase 0 fixture locks for the 18 Sep 2026 ledger.
 *
 * Correct FIFO (hand-verified):
 *   RCP/4837 ₹8,400 → INV/3122 from CN/119
 *   RCP/4838 ₹1,000 → INV/3123 from CN/119 leftover (CN/119 fully used)
 *   RCP/4839 ₹9,700 → INV/3123 from CN/120
 *   CN/120 remaining ₹4,150
 *
 * Banner Credit balance AND Unclaimed returns must both be ₹4,150.
 * ₹3,150 is the live bug (net − full linked invoice SRA) — never lock it as truth.
 *
 * These tests assert CORRECT behaviour against fetchCustomerLedgerTransactionsWithClient.
 * They are expected RED until Phase 1 (memo row + allocated remaining + voucher_date).
 */
import { describe, expect, it } from "vitest";
import {
  computeInvoiceOutstandingFromReconciliation,
  computeRefundableCreditBalance,
  saleReturnCreditForReconciliation,
} from "@/utils/customerLedgerReconciliation";
import {
  allocateCnAdjustmentsToSaleReturns,
  saleReturnRemainingCredit,
} from "@/utils/customerLedgerSaleReturnBalance";
import {
  getCustomerAccountState,
  saleReturnRemainingCreditForBalance,
} from "@/utils/customerBalanceCore";
import { formatCustomerAccountArithmeticLine } from "@/utils/customerAccountStateView";
import { isSaleReturnConsumedAtBilling } from "@/utils/saleReturnCnBalance";
import type { CustomerLedgerTransaction } from "@/utils/customerLedgerTransactions";
import {
  fetchCrossDayCnAdjustLedger,
  fetchMaseeraLedger,
  INV_3122,
  INV_3123,
  MASEERA_BUGGY_BANNER,
  MASEERA_UNCLAIMED,
  POS_51,
  POS_52,
  RCP_4837,
  RCP_4838,
  RCP_4839,
  SR_159_NET,
  SR_160_NET,
} from "../helpers/maseeraLedgerFixture";

function reconFromTransactions(transactions: CustomerLedgerTransaction[]) {
  let opening = 0;
  let grossInvoiced = 0;
  let invoiceCnApplied = 0;
  let saleReturns = 0;
  let paymentsCash = 0;
  let paymentsDiscount = 0;
  let advanceApplied = 0;
  let adjustments = 0;
  let cnRefunded = 0;

  for (const t of transactions) {
    if (t.id === "opening-balance") {
      opening = (t.debit || 0) - (t.credit || 0);
      continue;
    }
    if (t.informational) continue;
    if (t.type === "invoice") {
      grossInvoiced += t.grossBill ?? t.displayDebit ?? t.debit ?? 0;
      invoiceCnApplied += t.saleReturnAdjustApplied ?? 0;
    } else if (t.type === "return") {
      saleReturns += saleReturnCreditForReconciliation(t);
    } else if (t.type === "payment") {
      const discount = t.paymentBreakdown?.settlementDiscount || 0;
      const cash =
        t.paymentBreakdown?.cashReceived != null
          ? t.paymentBreakdown.cashReceived
          : Math.max(0, (t.credit || 0) - discount);
      paymentsCash += cash;
      paymentsDiscount += discount;
    } else if (t.type === "advance_application") {
      advanceApplied += t.appliedAmount || 0;
    } else if (t.type === "cn_refund" || t.type === "refund") {
      cnRefunded += t.debit || 0;
    } else if (t.type === "adjustment") {
      adjustments += (t.debit || 0) - (t.credit || 0);
    }
  }

  const invoiceOutstanding = computeInvoiceOutstandingFromReconciliation({
    opening,
    grossInvoiced,
    invoiceCnApplied,
    saleReturns,
    paymentsCash,
    paymentsDiscount,
    advanceApplied,
    adjustments,
    cnRefunded,
  });
  return { opening, grossInvoiced, invoiceCnApplied, saleReturns, paymentsCash, invoiceOutstanding };
}

describe("MASEERA FIFO arithmetic (not a report formula)", () => {
  it("CN/119 is fully used; CN/120 leftover is ₹4,150", () => {
    expect(RCP_4837 + RCP_4838).toBe(SR_159_NET);
    expect(SR_160_NET - RCP_4839).toBe(MASEERA_UNCLAIMED);
    expect(RCP_4838 + RCP_4839).toBe(INV_3123);
    expect(MASEERA_UNCLAIMED).not.toBe(MASEERA_BUGGY_BANNER);
  });
});

describe("MASEERA allocator — leftover uses allocated CN, not full invoice SRA", () => {
  it("pass-2 attributes ₹9,700 of INV/3123 to SR/160 (₹1,000 is CN/119)", () => {
    const map = allocateCnAdjustmentsToSaleReturns(
      [
        {
          id: "sr-159",
          net_amount: SR_159_NET,
          linked_sale_id: "inv-3123",
          return_date: "2026-09-18",
          created_at: "2026-09-18T15:03:00.000Z",
        },
        {
          id: "sr-160",
          net_amount: SR_160_NET,
          linked_sale_id: "inv-3123",
          return_date: "2026-09-18",
          created_at: "2026-09-18T15:04:00.000Z",
        },
      ],
      { "inv-3122": RCP_4837, "inv-3123": INV_3123 },
    );
    expect(map["sr-159"].applied).toBe(SR_159_NET);
    expect(map["sr-160"].applied).toBe(RCP_4839);

    const remaining159 = saleReturnRemainingCredit({
      grossNetAmount: SR_159_NET,
      consumedAmount: map["sr-159"].applied,
    });
    const remaining160 = saleReturnRemainingCredit({
      grossNetAmount: SR_160_NET,
      consumedAmount: map["sr-160"].applied,
    });
    expect(remaining159).toBe(0);
    expect(remaining160).toBe(MASEERA_UNCLAIMED);

    const fullSraConsumed = Math.max(
      Math.min(SR_160_NET, INV_3123),
      map["sr-160"].applied,
    );
    expect(
      saleReturnRemainingCredit({
        grossNetAmount: SR_160_NET,
        consumedAmount: fullSraConsumed,
      }),
    ).toBe(MASEERA_BUGGY_BANNER);
  });
});

describe("isSaleReturnConsumedAtBilling — do not widen", () => {
  it("still true for adjusted + linked (SHAHIN / billing-absorb gate)", () => {
    expect(
      isSaleReturnConsumedAtBilling({
        credit_status: "adjusted",
        linked_sale_id: "inv-3123",
      }),
    ).toBe(true);
    expect(
      isSaleReturnConsumedAtBilling({
        credit_status: "partially_adjusted",
        linked_sale_id: "inv-3123",
      }),
    ).toBe(false);
  });
});

describe("MASEERA ledger fetch — SR/159 memo + SR/160 remaining ₹4,150", () => {
  it("emits SR/159 as a tracing memo (credit 0), not omitted", async () => {
    const rows = await fetchMaseeraLedger();
    const sr159 = rows.find((r) => r.reference === "SR/26-27/159");
    expect(sr159, "SR/26-27/159 must appear as a ledger row").toBeTruthy();
    expect(sr159!.type).toBe("return");
    expect(sr159!.informational).toBe(true);
    expect(sr159!.credit).toBe(0);
  });

  it("SR/160 remaining credit is allocated leftover ₹4,150, not net−full SRA ₹3,150", async () => {
    const rows = await fetchMaseeraLedger();
    const sr160 = rows.find((r) => r.reference === "SR/26-27/160" && r.type === "return");
    expect(sr160).toBeTruthy();
    expect(sr160!.credit).toBe(MASEERA_UNCLAIMED);
    expect(sr160!.credit).not.toBe(MASEERA_BUGGY_BANNER);
    expect(sr160!.informational).not.toBe(true);
  });

  it("banner Credit balance and Unclaimed returns both equal ₹4,150", async () => {
    const rows = await fetchMaseeraLedger();
    const recon = reconFromTransactions(rows);
    expect(recon.grossInvoiced).toBe(POS_51 + POS_52 + INV_3122 + INV_3123);
    expect(recon.invoiceCnApplied).toBe(INV_3122 + INV_3123);
    expect(recon.saleReturns).toBe(MASEERA_UNCLAIMED);
    expect(recon.invoiceOutstanding).toBe(-MASEERA_UNCLAIMED);

    const banner = computeRefundableCreditBalance({
      unusedAdvance: 0,
      cnAvailable: 0,
      invoiceOutstanding: recon.invoiceOutstanding,
    });
    expect(banner).toBe(MASEERA_UNCLAIMED);
    expect(banner).not.toBe(MASEERA_BUGGY_BANNER);

    const state = getCustomerAccountState({
      openingBalance: 0,
      sales: [
        { id: "pos-51", net_amount: POS_51, paid_amount: POS_51, sale_return_adjust: 0, items_gross: POS_51 },
        { id: "pos-52", net_amount: POS_52, paid_amount: POS_52, sale_return_adjust: 0, items_gross: POS_52 },
        { id: "inv-3122", net_amount: INV_3122, paid_amount: 0, sale_return_adjust: INV_3122, items_gross: INV_3122 },
        { id: "inv-3123", net_amount: INV_3123, paid_amount: 0, sale_return_adjust: INV_3123, items_gross: INV_3123 },
      ],
      voucherEntries: [
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "inv-3122",
          total_amount: RCP_4837,
          payment_method: "credit_note_adjustment",
          description: "Credit note adjusted (Rs. 8400) against INV/26-27/3122",
        },
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "inv-3123",
          total_amount: RCP_4838,
          payment_method: "credit_note_adjustment",
          description: "Credit note adjusted (Rs. 1000) against INV/26-27/3123",
        },
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "inv-3123",
          total_amount: RCP_4839,
          payment_method: "credit_note_adjustment",
          description: "Credit note adjusted (Rs. 9700) against INV/26-27/3123",
        },
      ],
      customerAdvances: [],
      advanceRefunds: [],
      saleReturns: [
        {
          id: "sr-159",
          net_amount: SR_159_NET,
          credit_status: "adjusted",
          linked_sale_id: "inv-3123",
          credit_available_balance: 0,
        },
        {
          id: "sr-160",
          net_amount: SR_160_NET,
          credit_status: "partially_adjusted",
          linked_sale_id: "inv-3123",
          credit_available_balance: MASEERA_UNCLAIMED,
        },
      ],
      options: { ledgerAlignedApplicationReceipts: true },
    });
    expect(state.unclaimedSaleReturnCredit).toBe(MASEERA_UNCLAIMED);
    expect(saleReturnRemainingCreditForBalance(
      { net_amount: SR_160_NET, credit_available_balance: MASEERA_UNCLAIMED, linked_sale_id: "inv-3123" },
      INV_3123,
    )).toBe(MASEERA_UNCLAIMED);

    const line = formatCustomerAccountArithmeticLine({
      customerId: "maseera",
      customerName: "MASEERA",
      outstanding: state.outstanding,
      unusedAdvance: 0,
      unclaimedSaleReturn: state.unclaimedSaleReturnCredit,
      netPosition: state.netPosition,
      openingBalance: 0,
      advanceLegs: [],
    });
    expect(line).toContain("Unclaimed returns ₹4,150");
    expect(banner).toBe(state.unclaimedSaleReturnCredit);
  });
});

describe("cn_adjusted date — voucher_date, not invoice created_at", () => {
  it("MASEERA INV/3122 CN Adjust is 2026-09-18 (RCP/4837), not 2026-09-09", async () => {
    const rows = await fetchMaseeraLedger();
    const cnAdj = rows.find(
      (r) => r.type === "cn_adjusted" && r.reference === "INV/26-27/3122",
    );
    expect(cnAdj).toBeTruthy();
    expect(cnAdj!.date).toBe("2026-09-18");
    expect(cnAdj!.date).not.toBe("2026-09-09");
  });

  it("generic: CN applied nine days after the invoice uses the voucher date", async () => {
    const rows = await fetchCrossDayCnAdjustLedger();
    const cnAdj = rows.find((r) => r.type === "cn_adjusted");
    expect(cnAdj).toBeTruthy();
    expect(cnAdj!.date).toBe("2026-09-10");
    expect(cnAdj!.date).not.toBe("2026-09-01");
  });
});
