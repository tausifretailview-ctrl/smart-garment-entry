import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeCustomerOutstanding as computeAuditOutstanding } from "@/utils/customerAuditMath";
import {
  facetsFromInvoiceOutstanding,
  facetsFromPartySignedBalance,
} from "@/utils/customerAccountFacets";
import { getCustomerAccountState } from "@/utils/customerBalanceCore";
import { computeCustomerOutstanding } from "@/utils/customerBalanceUtils";
import {
  computeInvoiceOutstandingFromReconciliation,
  saleReturnCreditForReconciliation,
} from "@/utils/customerLedgerReconciliation";
import {
  accountFacetsFromFinancialSnapshot,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { alignPartyRowFromRpc } from "@/utils/customerPartyBalanceSnapshot";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";
import { computeSnapshotForSupplier } from "@/utils/supplierBalanceUtils";
import {
  balanceGatePassed,
  verifyCrossScreenHeadlineParity,
  verifyPartialCnMemoExclusion,
  verifySnapshotFacetIdentities,
} from "@/utils/customerBalanceVerificationGate";

/**
 * Phase 1 step 2 — equality locks across source families.
 * No screen migration. No live writes. Fixtures are the proven cases plus three
 * spanning families (advance-heavy, snapshot-only, third payable SQL).
 *
 * Inventory: docs/balance-single-source-of-truth-inventory-2026-08.md
 */

const TOL = 1;
const FARHAAN_SIGNED = -100;
const FARHAAN_UNPATCHED = -2_800;
const SANA_PARTY_SIGNED = -20_000;
const SANGAMN_S_JS = 154_648;
const SANGAMN_SUPPLIER = "supplier-sangamn";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function partyRow(
  partial: Partial<CustomerPartyBalanceRpcRow> & Pick<CustomerPartyBalanceRpcRow, "customer_id" | "signed_balance">,
): CustomerPartyBalanceRpcRow {
  return {
    customer_name: partial.customer_name ?? "X",
    advance_available: partial.advance_available ?? 0,
    direction: partial.direction ?? "",
    net_position: partial.net_position ?? partial.signed_balance,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
    ...partial,
  };
}

/** JS mirror of get_organization_supplier_payable_summary (20260618031454). */
function orgSupplierPayableSummarySql(input: {
  bills: Array<{ supplier_id: string; net_amount: number; paid_amount: number }>;
  paymentVouchers: Array<{ total_amount: number; discount_amount?: number }>;
  creditNotes: Array<{ total_amount: number; discount_amount?: number }>;
}) {
  const openBills = input.bills.reduce((s, b) => s + b.net_amount, 0);
  const paidViaBill = input.bills.reduce((s, b) => s + b.paid_amount, 0);
  const paidViaVouchers = input.paymentVouchers.reduce(
    (s, v) => s + v.total_amount + (v.discount_amount || 0),
    0,
  );
  const creditNotes = input.creditNotes.reduce(
    (s, v) => s + v.total_amount + (v.discount_amount || 0),
    0,
  );
  const supplierIds = new Set(
    input.bills.filter((b) => b.net_amount - b.paid_amount > 0.5).map((b) => b.supplier_id),
  );
  return {
    supplierCount: supplierIds.size,
    openBills: round2(openBills),
    paidViaBill: round2(paidViaBill),
    paidViaVouchers: round2(paidViaVouchers),
    creditNotes: round2(creditNotes),
    netOutstanding: round2(openBills - paidViaBill - paidViaVouchers - creditNotes),
  };
}

const FARHAAN_CORE = {
  openingBalance: 0,
  customerId: "farhaan",
  sales: [
    { id: "inv-a", net_amount: 11800, paid_amount: 11800, sale_return_adjust: 0, items_gross: 11800 },
    { id: "inv-b", net_amount: 2800, paid_amount: 2800, sale_return_adjust: 0, items_gross: 2800 },
    { id: "inv-c", net_amount: 2700, paid_amount: 0, sale_return_adjust: 2700, items_gross: 2700 },
  ],
  voucherEntries: [
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-a", total_amount: 11800, discount_amount: 0, payment_method: "cash", description: "" },
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-b", total_amount: 1700, discount_amount: 0, payment_method: "cash", description: "" },
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-b", total_amount: 1100, discount_amount: 0, payment_method: "cash", description: "" },
    {
      voucher_type: "receipt" as const,
      reference_type: "sale",
      reference_id: "inv-c",
      total_amount: 2700,
      discount_amount: 0,
      payment_method: "credit_note_adjustment",
      description: "Credit note adjusted against invoice INV/26-27/xxx",
    },
  ],
  customerAdvances: [] as Array<{ amount?: number | null; used_amount?: number | null; status: string }>,
  advanceRefunds: [] as Array<{ refund_amount?: number | null }>,
  saleReturns: [
    {
      net_amount: 2800,
      credit_status: "partially_adjusted",
      credit_available_balance: 100,
      linked_sale_id: null as string | null,
    },
  ],
  options: { ledgerAlignedApplicationReceipts: true as const },
};

const SANA_CORE = {
  openingBalance: 0,
  customerId: "sana-nasir",
  sales: [
    { id: "inv-sana", net_amount: 1_114_450, paid_amount: 0, sale_return_adjust: 0, items_gross: 1_114_450 },
  ],
  voucherEntries: [
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-sana", total_amount: 13_550, discount_amount: 0, payment_method: "cash", description: "" },
    {
      voucher_type: "receipt" as const,
      reference_type: "sale",
      reference_id: "inv-sana",
      total_amount: 1_100_900,
      discount_amount: 0,
      payment_method: "advance_adjustment",
      description: "Adjusted from advance balance for invoice",
    },
  ],
  customerAdvances: [{ amount: 1_120_900, used_amount: 1_100_900, status: "active" }],
  advanceRefunds: [] as Array<{ refund_amount?: number | null }>,
  saleReturns: [] as Array<{ net_amount?: number; credit_status?: string; linked_sale_id?: string | null }>,
  options: { ledgerAlignedApplicationReceipts: true as const },
};

const AAFRA_SNAP: CustomerFinancialSnapshot = {
  outstandingDr: 4_800,
  advanceAvailable: 10_000,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
  grossOutstandingDr: 14_800,
  netPosition: 4_800,
};

const SANGAMN_BILLS = [
  {
    id: "bill-1656",
    supplier_id: SANGAMN_SUPPLIER,
    net_amount: 250000,
    paid_amount: 100000,
    software_bill_no: "1656",
    supplier_invoice_no: "1656",
  },
  {
    id: "bill-1658",
    supplier_id: SANGAMN_SUPPLIER,
    net_amount: 245669,
    paid_amount: 110328,
    software_bill_no: "1658",
    supplier_invoice_no: "1658",
  },
];
const SANGAMN_PAYMENTS = [
  { reference_id: SANGAMN_SUPPLIER, total_amount: 100000, description: "Payment at purchase" },
  { reference_id: SANGAMN_SUPPLIER, total_amount: 110328, description: "Payment at purchase" },
];
const SANGAMN_CNS = [
  { id: "cn-pr-3", reference_id: SANGAMN_SUPPLIER, total_amount: 60328 },
  { id: "cn-pr-11", reference_id: SANGAMN_SUPPLIER, total_amount: 70365 },
];
const SANGAMN_RETURNS = [
  {
    supplier_id: SANGAMN_SUPPLIER,
    net_amount: 60328,
    credit_note_id: null,
    credit_status: "adjusted_outstanding",
    linked_bill_id: null,
    credit_available_balance: null,
  },
  {
    supplier_id: SANGAMN_SUPPLIER,
    net_amount: 70365,
    credit_note_id: "cn-pr-11",
    credit_status: "adjusted_outstanding",
    linked_bill_id: null,
    credit_available_balance: null,
  },
];

describe("Farhaan Fab — C-JS / C-PARTY / C-AUDIT / C-RECON / live RPC agree at −₹100", () => {
  const js = getCustomerAccountState(FARHAAN_CORE);
  const utils = computeCustomerOutstanding({
    openingBalance: 0,
    customerId: "farhaan",
    sales: FARHAAN_CORE.sales,
    vouchers: FARHAAN_CORE.voucherEntries.map((v) => ({
      reference_id: v.reference_id,
      reference_type: v.reference_type,
      total_amount: v.total_amount,
      discount_amount: v.discount_amount,
      payment_method: v.payment_method,
      description: v.description,
    })),
    adjustmentTotal: 0,
    advances: [],
    advanceRefundTotal: 0,
    saleReturns: FARHAAN_CORE.saleReturns,
    refundsPaidTotal: 0,
  });
  const audit = computeAuditOutstanding(FARHAAN_CORE, { ledgerAlignedApplicationReceipts: true });
  const recon = computeInvoiceOutstandingFromReconciliation({
    opening: 0,
    grossInvoiced: 17_300,
    invoiceCnApplied: 2_700,
    saleReturns: saleReturnCreditForReconciliation({ displayCredit: 2_800, credit: 100 }),
    paymentsCash: 14_600,
    paymentsDiscount: 0,
    advanceApplied: 0,
    adjustments: 0,
    cnRefunded: 0,
  });
  const partySqlShaped = round2(17_300 - 2_700 - 14_600 - 100);
  const liveParty = (() => {
    const text = readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/farhaan-party-rpc-after-20261126120000-2026-08-25.csv",
      ),
      "utf8",
    );
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(";");
    const cells = lines[1].split(";");
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? "").replace(/\t/g, "").trim();
    });
    return {
      name: row.customer_name,
      direction: row.direction,
      signed: Number(row.signed_balance),
      advance: Number(row.advance_available),
    };
  })();
  const partyAligned = alignPartyRowFromRpc(
    partyRow({
      customer_id: "farhaan",
      customer_name: "Farhaan Fab",
      signed_balance: liveParty.signed,
      advance_available: liveParty.advance,
    }),
    "7977353244",
  );

  it("C-JS netPosition is −₹100 and unused advance is 0", () => {
    expect(js.netPosition).toBeCloseTo(FARHAAN_SIGNED, 0);
    expect(js.balance).toBeCloseTo(FARHAAN_SIGNED, 0);
    expect(js.unusedAdvancePool).toBeCloseTo(0, 0);
    expect(js.unclaimedSaleReturnCredit).toBeCloseTo(100, 0);
  });

  it("C-UTILS / C-AUDIT / C-RECON / post-fix C-PARTY formula all equal C-JS", () => {
    expect(utils.balance).toBeCloseTo(js.balance, 0);
    expect(audit.outstanding).toBeCloseTo(js.balance, 0);
    expect(recon).toBeCloseTo(js.balance, 0);
    expect(partySqlShaped).toBeCloseTo(js.balance, 0);
  });

  it("live get_customer_party_balances after 20261126120000 is −₹100 Cr, not −₹2,800", () => {
    expect(liveParty.name).toBe("Farhaan Fab");
    expect(liveParty.direction).toBe("Cr");
    expect(liveParty.signed).toBe(FARHAAN_SIGNED);
    expect(liveParty.advance).toBe(0);
    expect(liveParty.signed).not.toBe(FARHAAN_UNPATCHED);
  });

  it("C-PARTY row facets from the live signed_balance match C-JS netPosition", () => {
    expect(partyAligned.net_position).toBeCloseTo(js.netPosition, 0);
    expect(Math.abs(partyAligned.gross_outstanding - js.outstanding)).toBeLessThanOrEqual(TOL);
    const jsFacets = facetsFromInvoiceOutstanding(js.outstanding, js.unusedAdvancePool);
    const partyFacets = facetsFromPartySignedBalance(liveParty.signed, liveParty.advance);
    expect(jsFacets).toEqual(partyFacets);
  });

  it("headline parity gate passes for C-JS vs live C-PARTY (net / outstanding / advance)", () => {
    expect(
      balanceGatePassed(
        verifyCrossScreenHeadlineParity({
          hookNet: js.netPosition,
          hookGross: js.outstanding,
          hookAdvance: js.unusedAdvancePool,
          partyNet: partyAligned.net_position,
          partyGross: partyAligned.gross_outstanding,
          partyAdvance: partyAligned.advance_available,
        }),
      ),
    ).toBe(true);
  });

  it("CN memo exclusion gate still flags the −₹2,800 path", () => {
    expect(balanceGatePassed(verifyPartialCnMemoExclusion(FARHAAN_CORE, js))).toBe(true);
    const buggy = getCustomerAccountState({
      ...FARHAAN_CORE,
      options: { ledgerAlignedApplicationReceipts: false },
    });
    expect(buggy.balance).toBeCloseTo(FARHAAN_UNPATCHED, 0);
    expect(buggy.balance).not.toBeCloseTo(js.balance, 0);
  });

  it("C-OB-SALES (opening + invoiced − paid_amount) is not the number", () => {
    const naive = 0 + 17_300 - (11_800 + 2_800 + 0);
    expect(naive).toBe(2_700);
    expect(naive).not.toBe(FARHAAN_SIGNED);
  });
});

describe("Sana Nasir — advance-heavy: C-JS netPosition equals C-PARTY signed (−₹20,000 Cr)", () => {
  const js = getCustomerAccountState(SANA_CORE);
  const partyFacets = facetsFromPartySignedBalance(SANA_PARTY_SIGNED, 20_000);
  const jsFacets = facetsFromInvoiceOutstanding(js.outstanding, js.unusedAdvancePool);

  it("C-JS keeps unused advance out of outstanding and nets it only in netPosition", () => {
    expect(js.balance).toBeCloseTo(0, 0);
    expect(js.unusedAdvancePool).toBeCloseTo(20_000, 0);
    expect(js.netPosition).toBeCloseTo(SANA_PARTY_SIGNED, 0);
  });

  it("C-PARTY signed (nets unused) recovers the same facets as C-JS", () => {
    expect(jsFacets).toEqual(partyFacets);
    expect(jsFacets.outstanding).toBe(0);
    expect(jsFacets.unusedAdvance).toBe(20_000);
    expect(jsFacets.netPosition).toBe(SANA_PARTY_SIGNED);
  });

  it("advance_adjustment memos stay out of receipts; used_amount is the consumption line", () => {
    const inclMemo = getCustomerAccountState({
      ...SANA_CORE,
      options: { ledgerAlignedApplicationReceipts: false },
    });
    // ledgerAligned false still drops advance_adjustment via isAdvanceApplicationVoucher
    // when payment_method is advance_adjustment — used_amount is the consumption line.
    expect(inclMemo.netPosition).toBeCloseTo(js.netPosition, 0);
    expect(js.totalAdvanceUsed).toBe(1_100_900);
  });
});

describe("Aafra — snapshot-only surface (C-SNAP) agrees with C-JS / C-PARTY facets", () => {
  const js = getCustomerAccountState({
    openingBalance: 0,
    customerId: "aafra",
    sales: [{ id: "inv-aafra", net_amount: 14_800, sale_return_adjust: 0, items_gross: 14_800 }],
    voucherEntries: [],
    customerAdvances: [{ amount: 10_000, used_amount: 0 }],
    advanceRefunds: [],
    saleReturns: [],
    options: { ledgerAlignedApplicationReceipts: true },
  });
  const partyFacets = facetsFromPartySignedBalance(4_800, 10_000);
  const snapFacets = accountFacetsFromFinancialSnapshot(AAFRA_SNAP);

  it("C-SNAP facet identities hold (net = outstanding_dr, gross = net + advance)", () => {
    expect(verifySnapshotFacetIdentities(AAFRA_SNAP)).toEqual([]);
  });

  it("C-SNAP / C-PARTY / C-JS outstanding·advance·net are the same triple", () => {
    expect(js.outstanding).toBe(14_800);
    expect(js.unusedAdvancePool).toBe(10_000);
    expect(js.netPosition).toBe(4_800);
    expect(snapFacets).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
    expect(partyFacets).toEqual(snapFacets);
    expect(facetsFromInvoiceOutstanding(js.outstanding, js.unusedAdvancePool)).toEqual(snapFacets);
  });
});

describe("SANGAMN FASHION — S-JS equals ₹1,54,648; S-ORG third SQL does not", () => {
  const snap = computeSnapshotForSupplier(
    SANGAMN_SUPPLIER,
    0,
    SANGAMN_BILLS,
    SANGAMN_PAYMENTS,
    SANGAMN_CNS,
    SANGAMN_RETURNS,
    0,
  );
  const org = orgSupplierPayableSummarySql({
    bills: SANGAMN_BILLS,
    paymentVouchers: SANGAMN_PAYMENTS,
    creditNotes: SANGAMN_CNS,
  });

  it("S-JS (computeSnapshotForSupplier) is ₹1,54,648 Cr", () => {
    expect(snap.balance).toBe(SANGAMN_S_JS);
  });

  it("S-ORG subtracts paid_amount AND the same supplier-id vouchers — not equal to S-JS", () => {
    expect(org.paidViaBill).toBe(org.paidViaVouchers);
    expect(org.paidViaBill).toBe(210_328);
    expect(org.netOutstanding).toBe(round2(495_669 - 210_328 - 210_328 - 130_693));
    expect(org.netOutstanding).not.toBe(snap.balance);
    expect(org.netOutstanding).toBe(-55_680);
  });

  it("dropping the duplicate voucher subtract from S-ORG recovers S-JS on this fixture", () => {
    const withoutDoublePay = round2(org.openBills - org.paidViaBill - org.creditNotes);
    expect(withoutDoublePay).toBe(snap.balance);
  });
});
