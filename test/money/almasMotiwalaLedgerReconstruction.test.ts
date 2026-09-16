/**
 * ALMAS MOTIWALA (ELLA NOOR, 9920671514) — 16 Sep 2026 ledger reconstruction.
 *
 * Investigation only: these assertions lock the THREE disagreeing displayed
 * figures and the SR/153 gross-vs-recon split. Do not treat the 6750 banner
 * as the economic truth.
 */
import { describe, expect, it } from "vitest";
import {
  computeInvoiceOutstandingFromReconciliation,
  computeRefundableCreditBalance,
  saleReturnCreditForReconciliation,
} from "@/utils/customerLedgerReconciliation";
import {
  saleReturnRemainingCredit,
  saleReturnRunningBalanceCredit,
  walkLedgerSignedBalance,
} from "@/utils/customerLedgerSaleReturnBalance";
import {
  getCustomerAccountState,
  saleReturnRemainingCreditForBalance,
} from "@/utils/customerBalanceCore";
import { formatCustomerAccountArithmeticLine } from "@/utils/customerAccountStateView";
import { invoiceOutstandingAmount } from "@/utils/recordInvoiceDashboardCashPayment";

/** Same allocation as customerLedgerTransactions.ts srAppliedMap (not exported). */
function attributeCnToLinkedSaleOnly(params: {
  srNet: number;
  linkedSaleId: string;
  cnBySaleId: Record<string, number>;
}): number {
  const remainingBySale = { ...params.cnBySaleId };
  const remaining = remainingBySale[params.linkedSaleId] || 0;
  return Math.min(remaining, params.srNet);
}

const INV_3005 = 8_550;
const INV_3009 = 4_700;
const INV_3064 = 1_800;
const CASH_RCP_4625 = 8_550;
const SR_153_GROSS = 8_550;
const CN_3009 = 4_700;
const CN_3064 = 1_800;

describe("ALMAS MOTIWALA — source arithmetic (not a report formula)", () => {
  it("seven-tx reconstruction: unclaimed CN ₹2,050 Cr; invoice pending ₹0", () => {
    const invoiced = INV_3005 + INV_3009 + INV_3064;
    const cashReceived = CASH_RCP_4625;
    const srCreditGenerated = SR_153_GROSS;
    const srCreditApplied = CN_3009 + CN_3064;
    const unclaimed = srCreditGenerated - srCreditApplied;
    // Signed party position: leftover CN is credit (customer owed), not invoice due.
    const netPosition = invoiced - cashReceived - srCreditGenerated;

    expect(invoiced).toBe(15_050);
    expect(cashReceived).toBe(8_550);
    expect(srCreditGenerated).toBe(8_550);
    expect(srCreditApplied).toBe(6_500);
    expect(unclaimed).toBe(2_050);
    expect(netPosition).toBe(-2_050);
    expect(INV_3005 - CASH_RCP_4625).toBe(0);
    expect(INV_3009 - CN_3009).toBe(0);
    expect(INV_3064 - CN_3064).toBe(0);
  });
});

describe("ALMAS MOTIWALA — why recon Sale Returns is ₹6,750 not ₹8,550", () => {
  it("srAppliedMap only consumes CN on the current linked_sale_id (last FIFO overwrite)", () => {
    // applyCreditNoteFifoToSale writes linked_sale_id = params.saleId on every chunk.
    // After CN → 3009 then CN → 3064, SR/153 points at 3064 only.
    const applied = attributeCnToLinkedSaleOnly({
      srNet: SR_153_GROSS,
      linkedSaleId: "inv-3064",
      cnBySaleId: { "inv-3009": CN_3009, "inv-3064": CN_3064 },
    });
    expect(applied).toBe(1_800);

    const absorbedOnInvoice = Math.min(SR_153_GROSS, CN_3064);
    const consumedAmount = Math.max(absorbedOnInvoice, applied);
    const remainingCredit = saleReturnRemainingCredit({
      grossNetAmount: SR_153_GROSS,
      consumedAmount,
    });
    expect(consumedAmount).toBe(1_800);
    expect(remainingCredit).toBe(6_750);

    expect(
      saleReturnCreditForReconciliation({
        displayCredit: SR_153_GROSS,
        credit: remainingCredit,
      }),
    ).toBe(6_750);
  });

  it("CAB / credit_notes remaining still holds the full unclaimed ₹2,050", () => {
    const cab = saleReturnRemainingCreditForBalance(
      {
        net_amount: SR_153_GROSS,
        credit_available_balance: 2_050,
        linked_sale_id: "inv-3064",
      },
      CN_3064,
    );
    expect(cab).toBe(2_050);
  });
});

describe("ALMAS MOTIWALA — three displayed figures vs code", () => {
  it("PDF banner ₹6,750 is recon Outstanding Cr, not CAB", () => {
    const saleReturns = saleReturnCreditForReconciliation({
      displayCredit: SR_153_GROSS,
      credit: 6_750,
    });
    const invoiceOutstanding = computeInvoiceOutstandingFromReconciliation({
      opening: 0,
      grossInvoiced: 15_050,
      invoiceCnApplied: 6_500,
      saleReturns,
      paymentsCash: 8_550,
      paymentsDiscount: 0,
      advanceApplied: 0,
      adjustments: 0,
    });
    expect(saleReturns).toBe(6_750);
    expect(invoiceOutstanding).toBe(-6_750);
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 0,
        cnAvailable: 0,
        invoiceOutstanding,
      }),
    ).toBe(6_750);
  });

  it("arithmetic strip ₹2,050 is getCustomerAccountState (CAB remaining)", () => {
    const state = getCustomerAccountState({
      openingBalance: 0,
      sales: [
        {
          id: "inv-3005",
          net_amount: INV_3005,
          paid_amount: INV_3005,
          sale_return_adjust: 0,
          items_gross: INV_3005,
        },
        {
          id: "inv-3009",
          net_amount: INV_3009,
          paid_amount: 0,
          sale_return_adjust: CN_3009,
          items_gross: INV_3009,
        },
        {
          id: "inv-3064",
          net_amount: INV_3064,
          paid_amount: 0,
          sale_return_adjust: CN_3064,
          items_gross: INV_3064,
        },
      ],
      voucherEntries: [
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "inv-3005",
          total_amount: CASH_RCP_4625,
          payment_method: "upi",
        },
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "inv-3009",
          total_amount: CN_3009,
          payment_method: "credit_note_adjustment",
          description: "Credit note adjusted (Rs. 4700) against INV/26-27/3009",
        },
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "inv-3064",
          total_amount: CN_3064,
          payment_method: "credit_note_adjustment",
          description: "Credit note adjusted (Rs. 1800) against INV/26-27/3064",
        },
      ],
      customerAdvances: [],
      advanceRefunds: [],
      saleReturns: [
        {
          net_amount: SR_153_GROSS,
          credit_status: "partially_adjusted",
          linked_sale_id: "inv-3064",
          credit_available_balance: 2_050,
        },
      ],
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(state.unclaimedSaleReturnCredit).toBe(2_050);
    expect(state.outstanding).toBe(-2_050);
    expect(state.netPosition).toBe(-2_050);

    const line = formatCustomerAccountArithmeticLine({
      customerId: "almas",
      customerName: "ALMAS MOTIWALA",
      outstanding: state.outstanding,
      unusedAdvance: 0,
      unclaimedSaleReturn: state.unclaimedSaleReturnCredit,
      netPosition: state.netPosition,
      openingBalance: 0,
      advanceLegs: [],
    });
    expect(line).toContain("Customer owes ₹2,050");
    expect(line).toContain("Net ₹2,050 Cr");
    expect(line).toContain("Unclaimed returns ₹2,050");
  });

  it("Sales Invoice Dashboard pending ₹0 is per-invoice outstanding, not party CN", () => {
    const invoices = [
      {
        id: "3005",
        sale_number: "INV/26-27/3005",
        net_amount: INV_3005,
        paid_amount: INV_3005,
        sale_return_adjust: 0,
      },
      {
        id: "3009",
        sale_number: "INV/26-27/3009",
        net_amount: INV_3009,
        paid_amount: 0,
        sale_return_adjust: CN_3009,
      },
      {
        id: "3064",
        sale_number: "INV/26-27/3064",
        net_amount: INV_3064,
        paid_amount: 0,
        sale_return_adjust: CN_3064,
      },
    ];
    const pending = invoices.reduce((sum, inv) => sum + invoiceOutstandingAmount(inv), 0);
    expect(pending).toBe(0);
  });
});

describe("ALMAS MOTIWALA — running Balance stays ₹8,550 Cr", () => {
  it("CN-covered invoices add invoiceDebit 0; CN adjust rows are informational", () => {
    let running = 0;
    running += INV_3005;
    running -= CASH_RCP_4625;
    running -= saleReturnRunningBalanceCredit(SR_153_GROSS);
    const invoiceDebit3009 = Math.max(0, INV_3009 - CN_3009);
    const invoiceDebit3064 = Math.max(0, INV_3064 - CN_3064);
    running += invoiceDebit3009;
    running += invoiceDebit3064;
    expect(invoiceDebit3009).toBe(0);
    expect(invoiceDebit3064).toBe(0);
    expect(running).toBe(-8_550);

    const displayedRows = [
      { displayDebit: INV_3005, displayCredit: 0 },
      { displayDebit: 0, displayCredit: CASH_RCP_4625 },
      { displayDebit: 0, displayCredit: SR_153_GROSS },
      { displayDebit: INV_3009, displayCredit: 0 },
      { informational: true, displayDebit: 0, displayCredit: CN_3009 },
      { displayDebit: INV_3064, displayCredit: 0 },
      { informational: true, displayDebit: 0, displayCredit: CN_3064 },
    ];
    // Column totals gap = true unclaimed; last running balance does not.
    expect(walkLedgerSignedBalance(displayedRows)).toBe(-2_050);
  });
});
