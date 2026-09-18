/**
 * MASEERA (ELLA NOOR) ledger fixture — 18 Sep 2026 PDF reconstruction.
 * FIFO: RCP/4837 ₹8,400 → INV/3122 (CN/119), RCP/4838 ₹1,000 → INV/3123
 * (CN/119 leftover), RCP/4839 ₹9,700 → INV/3123 (CN/120). CN/120 remaining ₹4,150.
 */
import { createFakeLedgerClient, type LedgerDb } from "./fakeLedgerSupabase";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";

export const MASEERA_ORG = "org-ella-noor-maseera-fixture";
export const MASEERA_CUSTOMER = "c-maseera";

export const POS_51 = 15_250;
export const POS_52 = 16_800;
export const INV_3122 = 8_400;
export const INV_3123 = 10_700;
export const SR_159_NET = 9_400;
export const SR_160_NET = 13_850;
export const RCP_4837 = 8_400;
export const RCP_4838 = 1_000;
export const RCP_4839 = 9_700;
/** Live leftover on CN/120 after FIFO. Banner and Unclaimed must both equal this. */
export const MASEERA_UNCLAIMED = 4_150;
/** Live wrong banner / recon remaining (net − full linked SRA on SR/160). */
export const MASEERA_BUGGY_BANNER = 3_150;

export function buildMaseeraLedgerDb(): LedgerDb {
  return {
    customers: [
      {
        id: MASEERA_CUSTOMER,
        organization_id: MASEERA_ORG,
        opening_balance: 0,
        deleted_at: null,
      },
    ],
    sales: [
      {
        id: "pos-51",
        organization_id: MASEERA_ORG,
        customer_id: MASEERA_CUSTOMER,
        sale_number: "POS/26-27/51",
        sale_type: "pos",
        sale_date: "2026-09-09",
        created_at: "2026-09-09T15:05:00.000Z",
        net_amount: POS_51,
        paid_amount: POS_51,
        sale_return_adjust: 0,
        payment_status: "completed",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: POS_51,
        payment_method: "upi",
        deleted_at: null,
      },
      {
        id: "pos-52",
        organization_id: MASEERA_ORG,
        customer_id: MASEERA_CUSTOMER,
        sale_number: "POS/26-27/52",
        sale_type: "pos",
        sale_date: "2026-09-09",
        created_at: "2026-09-09T15:07:00.000Z",
        net_amount: POS_52,
        paid_amount: POS_52,
        sale_return_adjust: 0,
        payment_status: "completed",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: POS_52,
        payment_method: "upi",
        deleted_at: null,
      },
      {
        id: "inv-3122",
        organization_id: MASEERA_ORG,
        customer_id: MASEERA_CUSTOMER,
        sale_number: "INV/26-27/3122",
        sale_type: "invoice",
        sale_date: "2026-09-09",
        created_at: "2026-09-09T15:00:00.000Z",
        net_amount: INV_3122,
        paid_amount: 0,
        sale_return_adjust: INV_3122,
        payment_status: "completed",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: 0,
        payment_method: "pay_later",
        deleted_at: null,
      },
      {
        id: "inv-3123",
        organization_id: MASEERA_ORG,
        customer_id: MASEERA_CUSTOMER,
        sale_number: "INV/26-27/3123",
        sale_type: "invoice",
        sale_date: "2026-09-18",
        created_at: "2026-09-18T15:06:00.000Z",
        net_amount: INV_3123,
        paid_amount: 0,
        sale_return_adjust: INV_3123,
        payment_status: "completed",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: 0,
        payment_method: "pay_later",
        deleted_at: null,
      },
    ],
    voucher_entries: [
      {
        id: "rcp-4837",
        organization_id: MASEERA_ORG,
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-3122",
        voucher_date: "2026-09-18",
        voucher_number: "RCP/26-27/4837",
        total_amount: RCP_4837,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted (Rs. 8400) against INV/26-27/3122",
        created_at: "2026-09-18T15:10:00.000Z",
        deleted_at: null,
      },
      {
        id: "rcp-4838",
        organization_id: MASEERA_ORG,
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-3123",
        voucher_date: "2026-09-18",
        voucher_number: "RCP/26-27/4838",
        total_amount: RCP_4838,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted (Rs. 1000) against INV/26-27/3123",
        created_at: "2026-09-18T15:11:00.000Z",
        deleted_at: null,
      },
      {
        id: "rcp-4839",
        organization_id: MASEERA_ORG,
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-3123",
        voucher_date: "2026-09-18",
        voucher_number: "RCP/26-27/4839",
        total_amount: RCP_4839,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted (Rs. 9700) against INV/26-27/3123",
        created_at: "2026-09-18T15:12:00.000Z",
        deleted_at: null,
      },
    ],
    customer_advances: [],
    customer_balance_adjustments: [],
    sale_returns: [
      {
        id: "sr-159",
        customer_id: MASEERA_CUSTOMER,
        organization_id: MASEERA_ORG,
        return_number: "SR/26-27/159",
        return_date: "2026-09-18",
        net_amount: SR_159_NET,
        credit_status: "adjusted",
        linked_sale_id: "inv-3123",
        refund_type: null,
        credit_note_id: "cn-119",
        credit_available_balance: 0,
        created_at: "2026-09-18T15:03:00.000Z",
        deleted_at: null,
      },
      {
        id: "sr-160",
        customer_id: MASEERA_CUSTOMER,
        organization_id: MASEERA_ORG,
        return_number: "SR/26-27/160",
        return_date: "2026-09-18",
        net_amount: SR_160_NET,
        credit_status: "partially_adjusted",
        linked_sale_id: "inv-3123",
        refund_type: null,
        credit_note_id: "cn-120",
        credit_available_balance: MASEERA_UNCLAIMED,
        created_at: "2026-09-18T15:04:00.000Z",
        deleted_at: null,
      },
    ],
    credit_notes: [
      {
        id: "cn-119",
        customer_id: MASEERA_CUSTOMER,
        organization_id: MASEERA_ORG,
        credit_note_number: "CN/26-27/119",
        issue_date: "2026-09-18",
        credit_amount: SR_159_NET,
        used_amount: SR_159_NET,
        status: "used",
        notes: "SR/26-27/159",
        sale_id: "inv-3123",
        created_at: "2026-09-18T15:03:00.000Z",
        deleted_at: null,
      },
      {
        id: "cn-120",
        customer_id: MASEERA_CUSTOMER,
        organization_id: MASEERA_ORG,
        credit_note_number: "CN/26-27/120",
        issue_date: "2026-09-18",
        credit_amount: SR_160_NET,
        used_amount: RCP_4839,
        status: "partial",
        notes: "SR/26-27/160",
        sale_id: "inv-3123",
        created_at: "2026-09-18T15:04:00.000Z",
        deleted_at: null,
      },
    ],
    advance_refunds: [],
  };
}

/** Invoice on day 1, CN adjustment voucher nine days later — date-bug fixture. */
export const CROSS_DAY_ORG = "org-cn-adjust-date-fixture";
export const CROSS_DAY_CUSTOMER = "c-cn-date";

export function buildCrossDayCnAdjustDb(): LedgerDb {
  return {
    customers: [
      {
        id: CROSS_DAY_CUSTOMER,
        organization_id: CROSS_DAY_ORG,
        opening_balance: 0,
        deleted_at: null,
      },
    ],
    sales: [
      {
        id: "inv-old",
        organization_id: CROSS_DAY_ORG,
        customer_id: CROSS_DAY_CUSTOMER,
        sale_number: "INV/26-27/1",
        sale_type: "invoice",
        sale_date: "2026-09-01",
        created_at: "2026-09-01T10:00:00.000Z",
        net_amount: 5_000,
        paid_amount: 0,
        sale_return_adjust: 1_000,
        payment_status: "partial",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: 0,
        payment_method: "pay_later",
        deleted_at: null,
      },
    ],
    voucher_entries: [
      {
        id: "rcp-later",
        organization_id: CROSS_DAY_ORG,
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-old",
        voucher_date: "2026-09-10",
        voucher_number: "RCP/26-27/99",
        total_amount: 1_000,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted (Rs. 1000) against INV/26-27/1",
        created_at: "2026-09-10T14:00:00.000Z",
        deleted_at: null,
      },
    ],
    customer_advances: [],
    customer_balance_adjustments: [],
    sale_returns: [],
    credit_notes: [],
    advance_refunds: [],
  };
}

export async function fetchMaseeraLedger() {
  const client = createFakeLedgerClient(buildMaseeraLedgerDb()) as unknown as Parameters<
    typeof fetchCustomerLedgerTransactionsWithClient
  >[0];
  return fetchCustomerLedgerTransactionsWithClient(
    client,
    MASEERA_ORG,
    MASEERA_CUSTOMER,
    { startDate: null, endDate: null },
    0,
  );
}

/**
 * Worst-case 3a undercount split: earlier SR absorbs the whole shared-invoice
 * SRA; later SR is the pool leftover. Live per-SR nets were not in the paste —
 * this only locks the helper against charging that leftover the full SRA.
 */
export function buildSharedSraLaterLeftoverDb(params: {
  org: string;
  customer: string;
  saleId: string;
  saleNumber: string;
  sra: number;
  earlierNet: number;
  laterNet: number;
  voucherDate?: string;
}): LedgerDb {
  const saleDate = "2026-09-01";
  const voucherDate = params.voucherDate || "2026-09-06";
  return {
    customers: [
      {
        id: params.customer,
        organization_id: params.org,
        opening_balance: 0,
        deleted_at: null,
      },
    ],
    sales: [
      {
        id: params.saleId,
        organization_id: params.org,
        customer_id: params.customer,
        sale_number: params.saleNumber,
        sale_type: "invoice",
        sale_date: saleDate,
        created_at: `${saleDate}T10:00:00.000Z`,
        net_amount: params.sra,
        paid_amount: 0,
        sale_return_adjust: params.sra,
        payment_status: "completed",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: 0,
        payment_method: "pay_later",
        deleted_at: null,
      },
    ],
    voucher_entries: [
      {
        id: `${params.saleId}-cn`,
        organization_id: params.org,
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: params.saleId,
        voucher_date: voucherDate,
        voucher_number: `RCP-${params.saleId}`,
        total_amount: params.sra,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: `Credit note adjusted (Rs. ${params.sra}) against ${params.saleNumber}`,
        created_at: `${voucherDate}T12:00:00.000Z`,
        deleted_at: null,
      },
    ],
    customer_advances: [],
    customer_balance_adjustments: [],
    sale_returns: [
      {
        id: `${params.saleId}-sr-earlier`,
        customer_id: params.customer,
        organization_id: params.org,
        return_number: `SR-EARLIER-${params.saleNumber}`,
        return_date: voucherDate,
        net_amount: params.earlierNet,
        credit_status: "adjusted",
        linked_sale_id: params.saleId,
        refund_type: null,
        credit_note_id: `${params.saleId}-cn-earlier`,
        credit_available_balance: 0,
        created_at: `${voucherDate}T11:00:00.000Z`,
        deleted_at: null,
      },
      {
        id: `${params.saleId}-sr-later`,
        customer_id: params.customer,
        organization_id: params.org,
        return_number: `SR-LATER-${params.saleNumber}`,
        return_date: voucherDate,
        net_amount: params.laterNet,
        credit_status: "partially_adjusted",
        linked_sale_id: params.saleId,
        refund_type: null,
        credit_note_id: `${params.saleId}-cn-later`,
        credit_available_balance: params.laterNet,
        created_at: `${voucherDate}T11:01:00.000Z`,
        deleted_at: null,
      },
    ],
    credit_notes: [
      {
        id: `${params.saleId}-cn-earlier`,
        customer_id: params.customer,
        organization_id: params.org,
        credit_note_number: `CN-EARLIER-${params.saleNumber}`,
        issue_date: voucherDate,
        credit_amount: params.earlierNet,
        used_amount: params.earlierNet,
        status: "used",
        notes: "earlier",
        sale_id: params.saleId,
        created_at: `${voucherDate}T11:00:00.000Z`,
        deleted_at: null,
      },
      {
        id: `${params.saleId}-cn-later`,
        customer_id: params.customer,
        organization_id: params.org,
        credit_note_number: `CN-LATER-${params.saleNumber}`,
        issue_date: voucherDate,
        credit_amount: params.laterNet,
        used_amount: 0,
        status: "open",
        notes: "later leftover",
        sale_id: params.saleId,
        created_at: `${voucherDate}T11:01:00.000Z`,
        deleted_at: null,
      },
    ],
    advance_refunds: [],
  };
}

export async function fetchSharedSraLaterLeftoverLedger(
  params: Parameters<typeof buildSharedSraLaterLeftoverDb>[0],
) {
  const client = createFakeLedgerClient(buildSharedSraLaterLeftoverDb(params)) as unknown as Parameters<
    typeof fetchCustomerLedgerTransactionsWithClient
  >[0];
  return fetchCustomerLedgerTransactionsWithClient(
    client,
    params.org,
    params.customer,
    { startDate: null, endDate: null },
    0,
  );
}

export async function fetchCrossDayCnAdjustLedger() {
  const client = createFakeLedgerClient(buildCrossDayCnAdjustDb()) as unknown as Parameters<
    typeof fetchCustomerLedgerTransactionsWithClient
  >[0];
  return fetchCustomerLedgerTransactionsWithClient(
    client,
    CROSS_DAY_ORG,
    CROSS_DAY_CUSTOMER,
    { startDate: null, endDate: null },
    0,
  );
}
