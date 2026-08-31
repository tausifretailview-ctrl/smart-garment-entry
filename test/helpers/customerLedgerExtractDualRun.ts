import { createFakeLedgerClient, type LedgerDb } from "./fakeLedgerSupabase";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import { fetchCustomerLedgerTransactionsDesktopInline } from "../../scripts/lib/customerLedgerRetailInline.generated";
import type { CustomerLedgerTransaction } from "@/utils/customerLedgerTransactions";

const ORG = "org-ledger-extract-dual-run";

export type LedgerRowKey = {
  date: string;
  type: CustomerLedgerTransaction["type"];
  debit: number;
  credit: number;
  balance: number;
  id: string;
  reference: string;
};

export function ledgerRowKeys(rows: CustomerLedgerTransaction[]): LedgerRowKey[] {
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
    id: r.id,
    reference: r.reference,
  }));
}

export function diffLedgerRows(
  extracted: CustomerLedgerTransaction[],
  desktop: CustomerLedgerTransaction[],
): string[] {
  const a = ledgerRowKeys(extracted);
  const b = ledgerRowKeys(desktop);
  const msgs: string[] = [];
  if (a.length !== b.length) {
    msgs.push(`count: extracted=${a.length} desktop=${b.length}`);
  }
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      msgs.push(`row[${i}]: ${left ? "extra extracted" : "missing extracted"} ${JSON.stringify(left ?? right)}`);
      continue;
    }
    for (const k of ["date", "type", "debit", "credit", "balance"] as const) {
      if (left[k] !== right[k]) {
        msgs.push(`row[${i}].${k}: extracted=${String(left[k])} desktop=${String(right[k])} (id ${left.id}/${right.id})`);
      }
    }
  }
  return msgs;
}

function sale(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    organization_id: ORG,
    sale_type: "invoice",
    paid_amount: 0,
    sale_return_adjust: 0,
    payment_status: "pending",
    is_cancelled: false,
    cash_amount: 0,
    card_amount: 0,
    upi_amount: 0,
    deleted_at: null,
    payment_method: "pay_later",
    created_at: `${partial.sale_date || "2026-04-01"}T10:00:00.000Z`,
    ...partial,
  };
}

function voucher(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    organization_id: ORG,
    voucher_type: "receipt",
    reference_type: "sale",
    discount_amount: 0,
    payment_method: "cash",
    deleted_at: null,
    created_at: `${partial.voucher_date || "2026-04-01"}T11:00:00.000Z`,
    ...partial,
  };
}

export type DualRunCase = {
  id: string;
  label: string;
  openingBalance: number;
  dateRange?: { startDate: Date | null; endDate: Date | null };
};

function buildDb(): { db: LedgerDb; cases: DualRunCase[] } {
  const customers: Record<string, unknown>[] = [];
  const sales: Record<string, unknown>[] = [];
  const voucher_entries: Record<string, unknown>[] = [];
  const customer_advances: Record<string, unknown>[] = [];
  const customer_balance_adjustments: Record<string, unknown>[] = [];
  const sale_returns: Record<string, unknown>[] = [];
  const credit_notes: Record<string, unknown>[] = [];
  const advance_refunds: Record<string, unknown>[] = [];
  const cases: DualRunCase[] = [];

  const addCustomer = (id: string, opening: number, label: string, extra?: Partial<DualRunCase>) => {
    customers.push({
      id,
      organization_id: ORG,
      opening_balance: opening,
      deleted_at: null,
    });
    cases.push({ id, label, openingBalance: opening, ...extra });
  };

  // 1. Opening balance only
  addCustomer("c-ob-only", 5000, "opening balance only");

  // 2. Plain invoices + payments
  addCustomer("c-plain", 0, "plain invoices + payments");
  sales.push(
    sale({
      id: "s-plain-1",
      customer_id: "c-plain",
      sale_number: "INV/26-27/1",
      sale_date: "2026-04-05",
      net_amount: 2000,
      paid_amount: 2000,
      payment_status: "completed",
    }),
    sale({
      id: "s-plain-2",
      customer_id: "c-plain",
      sale_number: "INV/26-27/2",
      sale_date: "2026-04-12",
      net_amount: 1500,
      paid_amount: 500,
      payment_status: "partial",
    }),
  );
  voucher_entries.push(
    voucher({
      id: "v-plain-1",
      reference_id: "s-plain-1",
      voucher_date: "2026-04-05",
      voucher_number: "RCPT/1",
      total_amount: 2000,
      description: "Payment received",
    }),
    voucher({
      id: "v-plain-2",
      reference_id: "s-plain-2",
      voucher_date: "2026-04-20",
      voucher_number: "RCPT/2",
      total_amount: 500,
      description: "Partial payment",
    }),
  );

  // 3. Opening + opening-balance receipts (reference_type customer)
  addCustomer("c-ob-paid", 10000, "opening balance + customer receipts");
  voucher_entries.push(
    voucher({
      id: "v-ob-1",
      reference_id: "c-ob-paid",
      reference_type: "customer",
      voucher_date: "2026-04-02",
      voucher_number: "RCPT/OB1",
      total_amount: 4000,
      description: "Opening balance payment",
    }),
  );

  // 4. Unused advance
  addCustomer("c-adv-unused", 0, "unused advance");
  customer_advances.push({
    id: "adv-unused",
    customer_id: "c-adv-unused",
    organization_id: ORG,
    amount: 3000,
    used_amount: 0,
    status: "active",
    advance_date: "2026-04-03",
    advance_number: "ADV/1",
    created_at: "2026-04-03T09:00:00.000Z",
  });

  // 5. Advance applied to invoice
  addCustomer("c-adv-applied", 0, "advance applied to invoice");
  sales.push(
    sale({
      id: "s-adv-1",
      customer_id: "c-adv-applied",
      sale_number: "INV/26-27/10",
      sale_date: "2026-04-08",
      net_amount: 8000,
      paid_amount: 3000,
      payment_status: "partial",
    }),
  );
  customer_advances.push({
    id: "adv-applied",
    customer_id: "c-adv-applied",
    organization_id: ORG,
    amount: 3000,
    used_amount: 3000,
    status: "fully_used",
    advance_date: "2026-04-07",
    advance_number: "ADV/2",
    created_at: "2026-04-07T09:00:00.000Z",
  });
  voucher_entries.push(
    voucher({
      id: "v-adv-apply",
      reference_id: "s-adv-1",
      voucher_date: "2026-04-08",
      voucher_number: "RCPT/ADV",
      total_amount: 3000,
      payment_method: "advance_adjustment",
      description: "Advance adjusted against INV/26-27/10",
    }),
  );

  // 6. Sale return adjusted onto linked invoice
  addCustomer("c-sr-adj", 0, "sale return absorbed on invoice");
  sales.push(
    sale({
      id: "s-sr-1",
      customer_id: "c-sr-adj",
      sale_number: "INV/26-27/20",
      sale_date: "2026-04-10",
      net_amount: 5000,
      sale_return_adjust: 2000,
      paid_amount: 0,
      payment_status: "partial",
    }),
  );
  sale_returns.push({
    id: "sr-adj-1",
    customer_id: "c-sr-adj",
    organization_id: ORG,
    return_number: "SR/26-27/20",
    return_date: "2026-04-11",
    net_amount: 2000,
    credit_status: "adjusted",
    linked_sale_id: "s-sr-1",
    refund_type: null,
    credit_note_id: "cn-sr-1",
    created_at: "2026-04-11T12:00:00.000Z",
    deleted_at: null,
  });
  credit_notes.push({
    id: "cn-sr-1",
    customer_id: "c-sr-adj",
    organization_id: ORG,
    credit_note_number: "CN/1",
    issue_date: "2026-04-11",
    credit_amount: 2000,
    used_amount: 2000,
    status: "used",
    notes: "from SR",
    sale_id: "s-sr-1",
    created_at: "2026-04-11T12:00:00.000Z",
    deleted_at: null,
  });

  // 7. Sale return cash refunded
  addCustomer("c-sr-refund", 0, "sale return cash refunded");
  sales.push(
    sale({
      id: "s-sr-ref",
      customer_id: "c-sr-refund",
      sale_number: "INV/26-27/21",
      sale_date: "2026-04-09",
      net_amount: 4000,
      paid_amount: 4000,
      payment_status: "completed",
      cash_amount: 4000,
    }),
  );
  sale_returns.push({
    id: "sr-ref-1",
    customer_id: "c-sr-refund",
    organization_id: ORG,
    return_number: "SR/26-27/21",
    return_date: "2026-04-15",
    net_amount: 1500,
    credit_status: "refunded",
    linked_sale_id: "s-sr-ref",
    refund_type: "cash",
    credit_note_id: null,
    created_at: "2026-04-15T12:00:00.000Z",
    deleted_at: null,
  });
  voucher_entries.push(
    voucher({
      id: "v-sr-refund",
      voucher_type: "payment",
      reference_type: "customer",
      reference_id: "c-sr-refund",
      voucher_date: "2026-04-15",
      voucher_number: "RF/1",
      total_amount: 1500,
      payment_method: "cn_refund",
      description: "Refund paid for sale return SR/26-27/21",
    }),
  );

  // 8. Orphaned refund voucher (wrong reference_id, matched by description)
  addCustomer("c-orphan-rf", 0, "orphaned refund voucher via description match");
  sale_returns.push({
    id: "sr-orphan",
    customer_id: "c-orphan-rf",
    organization_id: ORG,
    return_number: "SR/26-27/77",
    return_date: "2026-04-18",
    net_amount: 900,
    credit_status: "refunded",
    linked_sale_id: null,
    refund_type: "cash",
    credit_note_id: null,
    created_at: "2026-04-18T12:00:00.000Z",
    deleted_at: null,
  });
  voucher_entries.push(
    voucher({
      id: "v-orphan-rf",
      voucher_type: "payment",
      reference_type: "customer",
      reference_id: "customer-id-from-an-old-row",
      voucher_date: "2026-04-18",
      voucher_number: "RF/77",
      total_amount: 900,
      payment_method: "cn_refund",
      description: "Refund paid for sale return SR/26-27/77",
    }),
  );

  // 9. Balance adjustment
  addCustomer("c-adj", 2000, "balance adjustment");
  customer_balance_adjustments.push({
    id: "adj-1",
    customer_id: "c-adj",
    organization_id: ORG,
    adjustment_date: "2026-04-16",
    created_at: "2026-04-16T08:00:00.000Z",
    outstanding_difference: -500,
    advance_difference: 0,
    reason: "Write-off small due",
  });

  // 10. Standalone credit note (not linked to a sale return)
  addCustomer("c-cn", 0, "standalone credit note");
  credit_notes.push({
    id: "cn-solo",
    customer_id: "c-cn",
    organization_id: ORG,
    credit_note_number: "CN/SOLO",
    issue_date: "2026-04-14",
    credit_amount: 750,
    used_amount: 0,
    status: "open",
    notes: "goodwill",
    sale_id: null,
    created_at: "2026-04-14T15:00:00.000Z",
    deleted_at: null,
  });

  // 11. Pay-later unpaid
  addCustomer("c-unpaid", 0, "unpaid pay-later invoice");
  sales.push(
    sale({
      id: "s-unpaid",
      customer_id: "c-unpaid",
      sale_number: "INV/26-27/30",
      sale_date: "2026-04-06",
      net_amount: 999,
      paid_amount: 0,
      payment_status: "pending",
    }),
  );

  // 12. POS at-sale cash tender + later receipt (backfill skip pattern)
  addCustomer("c-pos-cash", 0, "POS at-sale cash + possible backfill voucher");
  sales.push(
    sale({
      id: "s-pos-1",
      customer_id: "c-pos-cash",
      sale_number: "POS/26-27/1",
      sale_type: "pos",
      sale_date: "2026-04-04",
      net_amount: 1250,
      paid_amount: 1250,
      payment_status: "completed",
      cash_amount: 1250,
      payment_method: "cash",
    }),
  );
  voucher_entries.push(
    voucher({
      id: "v-pos-backfill",
      reference_id: "s-pos-1",
      voucher_date: "2026-04-04",
      voucher_number: "RCPT/POS",
      total_amount: 1250,
      description: "Phase 4 backfill receipt",
    }),
  );

  // 13. Settlement discount receipt
  addCustomer("c-disc", 0, "settlement discount on receipt");
  sales.push(
    sale({
      id: "s-disc",
      customer_id: "c-disc",
      sale_number: "INV/26-27/40",
      sale_date: "2026-04-13",
      net_amount: 1000,
      paid_amount: 1000,
      payment_status: "completed",
    }),
  );
  voucher_entries.push(
    voucher({
      id: "v-disc",
      reference_id: "s-disc",
      voucher_date: "2026-04-13",
      voucher_number: "RCPT/D",
      total_amount: 900,
      discount_amount: 100,
      description: "Payment received",
    }),
  );

  // 14. Mixed: invoice, payment, return, advance
  addCustomer("c-mixed", 1500, "mixed invoice+payment+return+advance");
  sales.push(
    sale({
      id: "s-mix-1",
      customer_id: "c-mixed",
      sale_number: "INV/26-27/50",
      sale_date: "2026-04-01",
      net_amount: 6000,
      paid_amount: 2000,
      payment_status: "partial",
    }),
  );
  voucher_entries.push(
    voucher({
      id: "v-mix-pay",
      reference_id: "s-mix-1",
      voucher_date: "2026-04-02",
      voucher_number: "RCPT/M",
      total_amount: 2000,
    }),
  );
  customer_advances.push({
    id: "adv-mix",
    customer_id: "c-mixed",
    organization_id: ORG,
    amount: 1000,
    used_amount: 0,
    status: "active",
    advance_date: "2026-04-03",
    advance_number: "ADV/M",
    created_at: "2026-04-03T10:00:00.000Z",
  });
  sale_returns.push({
    id: "sr-mix",
    customer_id: "c-mixed",
    organization_id: ORG,
    return_number: "SR/26-27/50",
    return_date: "2026-04-17",
    net_amount: 800,
    credit_status: "adjusted_outstanding",
    linked_sale_id: null,
    refund_type: null,
    credit_note_id: null,
    created_at: "2026-04-17T10:00:00.000Z",
    deleted_at: null,
  });

  // 15. Date-range B/F: activity before and after the window
  addCustomer("c-range", 1000, "date-filtered brought-forward", {
    dateRange: {
      startDate: new Date("2026-04-10T00:00:00"),
      endDate: new Date("2026-04-20T00:00:00"),
    },
  });
  sales.push(
    sale({
      id: "s-range-old",
      customer_id: "c-range",
      sale_number: "INV/26-27/60",
      sale_date: "2026-04-01",
      net_amount: 3000,
      paid_amount: 1000,
      payment_status: "partial",
    }),
    sale({
      id: "s-range-new",
      customer_id: "c-range",
      sale_number: "INV/26-27/61",
      sale_date: "2026-04-12",
      net_amount: 800,
      paid_amount: 0,
      payment_status: "pending",
    }),
  );
  voucher_entries.push(
    voucher({
      id: "v-range-old",
      reference_id: "s-range-old",
      voucher_date: "2026-04-02",
      voucher_number: "RCPT/R0",
      total_amount: 1000,
    }),
  );

  // 16. Empty customer
  addCustomer("c-empty", 0, "no transactions");

  // 17. CN-adjust receipt on sale (should be excluded from voucher list)
  addCustomer("c-cn-voucher", 0, "credit-note-adjusted receipt excluded");
  sales.push(
    sale({
      id: "s-cnv",
      customer_id: "c-cn-voucher",
      sale_number: "INV/26-27/70",
      sale_date: "2026-04-08",
      net_amount: 4000,
      sale_return_adjust: 1000,
      paid_amount: 0,
      payment_status: "partial",
    }),
  );
  voucher_entries.push(
    voucher({
      id: "v-cnv",
      reference_id: "s-cnv",
      voucher_date: "2026-04-08",
      voucher_number: "RCPT/CN",
      total_amount: 1000,
      payment_method: "credit_note_adjustment",
      description: "Credit note adjusted against INV/26-27/70",
    }),
  );

  // 18. Advance refund (advance_refunds table + matching payment voucher skipped)
  addCustomer("c-adv-rf", 0, "advance refund");
  customer_advances.push({
    id: "adv-rf",
    customer_id: "c-adv-rf",
    organization_id: ORG,
    amount: 2000,
    used_amount: 0,
    status: "active",
    advance_date: "2026-04-01",
    advance_number: "ADV/RF",
    created_at: "2026-04-01T09:00:00.000Z",
  });
  advance_refunds.push({
    id: "ar-1",
    organization_id: ORG,
    advance_id: "adv-rf",
    refund_amount: 500,
    refund_date: "2026-04-19",
    payment_method: "cash",
    reason: "customer request",
    refund_number: "ARF/1",
    created_at: "2026-04-19T11:00:00.000Z",
    customer_advances: { advance_number: "ADV/RF" },
  });
  voucher_entries.push(
    voucher({
      id: "v-arf",
      voucher_type: "payment",
      reference_type: "customer",
      reference_id: "c-adv-rf",
      voucher_date: "2026-04-19",
      voucher_number: "ARF/1",
      total_amount: 500,
      payment_method: "advance_refund",
      description: "Advance refund ADV/RF",
    }),
  );

  return {
    db: {
      customers,
      sales,
      voucher_entries,
      customer_advances,
      customer_balance_adjustments,
      sale_returns,
      credit_notes,
      advance_refunds,
    },
    cases,
  };
}

export async function runFixtureDualRun(): Promise<{
  caseCount: number;
  failures: { id: string; label: string; diffs: string[] }[];
}> {
  const { db, cases } = buildDb();
  const failures: { id: string; label: string; diffs: string[] }[] = [];

  for (const c of cases) {
    const client = createFakeLedgerClient(db) as unknown as Parameters<
      typeof fetchCustomerLedgerTransactionsWithClient
    >[0];
    const extracted = await fetchCustomerLedgerTransactionsWithClient(
      client,
      ORG,
      c.id,
      c.dateRange,
      c.openingBalance,
    );
    const desktop = await fetchCustomerLedgerTransactionsDesktopInline(
      client,
      ORG,
      { id: c.id, opening_balance: c.openingBalance },
      c.dateRange?.startDate ?? undefined,
      c.dateRange?.endDate ?? undefined,
    );
    const diffs = diffLedgerRows(extracted, desktop);
    if (diffs.length) failures.push({ id: c.id, label: c.label, diffs });
  }

  return { caseCount: cases.length, failures };
}
