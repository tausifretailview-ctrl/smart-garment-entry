/**
 * Credit Note / S-R Adjustment Register — remaining amounts.
 *
 * ONE calculation: remaining is always
 *   saleReturnRemainingCredit({ consumed: saleReturnConsumedForRemaining(...) })
 * after allocateCnAdjustmentsToSaleReturns (Phase 1 allocated-CN FIFO).
 * Do not use sale_returns.remaining_cn_amt (full-linked-invoice SRA).
 */
import {
  allocateCnAdjustmentsToSaleReturns,
  saleReturnConsumedForRemaining,
  saleReturnRemainingCredit,
} from "@/utils/customerLedgerSaleReturnBalance";

const SETTLED_REMAINING = 0.5;

export type CreditNoteSrDateBasis = "return_date" | "cn_applied";

export type CreditNoteSrRegisterSaleReturn = {
  id: string;
  return_number: string;
  return_date: string | null;
  created_at?: string | null;
  customer_id: string | null;
  /** Name stored on the return when the customer row is missing. */
  customer_name?: string | null;
  net_amount?: number | null;
  credit_status?: string | null;
  linked_sale_id?: string | null;
  credit_note_id?: string | null;
  refund_type?: string | null;
};

export type CreditNoteSrRegisterVoucher = {
  voucher_type?: string | null;
  payment_method?: string | null;
  description?: string | null;
  reference_id?: string | null;
  total_amount?: number | null;
  voucher_date?: string | null;
  created_at?: string | null;
  voucher_number?: string | null;
};

export type CreditNoteSrRegisterSource = {
  saleReturns: CreditNoteSrRegisterSaleReturn[];
  customersById: Record<string, { customer_name?: string | null; phone?: string | null }>;
  salesById: Record<
    string,
    {
      sale_number?: string | null;
      sale_return_adjust?: number | null;
      sale_type?: string | null;
      sale_date?: string | null;
    }
  >;
  creditNotesById: Record<string, { credit_note_number?: string | null; credit_amount?: number | null }>;
  vouchers: CreditNoteSrRegisterVoucher[];
};

export type CreditNoteSrRedeemedBill = {
  saleId: string;
  saleNumber: string;
  /** POS or Sale. Empty when the sale type was not loaded. */
  billKind: "POS" | "Sale" | "";
  saleDate: string;
  amount: number;
};

export type CreditNoteSrRegisterRow = {
  id: string;
  returnNumber: string;
  returnDate: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  linkedInvoiceNumbers: string;
  linkedBills: CreditNoteSrRedeemedBill[];
  netReturnAmount: number;
  creditNoteNumber: string;
  creditNoteAmount: number;
  /** Same rupees as consumedAmount — the redeem that reduced remaining. */
  appliedAmount: number;
  appliedToInvoices: string;
  redeemedBills: CreditNoteSrRedeemedBill[];
  remainingAmount: number;
  consumedAmount: number;
  cnAppliedDate: string | null;
  creditStatus: string;
  statusLabel: string;
  isMemo: boolean;
};

/** dd/MM/yyyy from an ISO date. Empty when the value is not a calendar date. */
export function formatRegisterDate(iso: string | null | undefined): string {
  const d = String(iso || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** POS bills stay POS. Sale invoices (sale_invoice / invoice / sale) stay Sale. */
export function saleBillKindLabel(saleType: string | null | undefined): "POS" | "Sale" | "" {
  const t = String(saleType || "").trim().toLowerCase();
  if (t === "pos") return "POS";
  if (t === "sale_invoice" || t === "sale" || t === "invoice") return "Sale";
  return "";
}

export function formatRedeemedBillLabel(bill: {
  saleNumber: string;
  billKind?: string;
  saleDate?: string | null;
  amount?: number;
  showAmount?: boolean;
}): string {
  const parts = [bill.saleNumber];
  if (bill.billKind) parts.push(bill.billKind);
  const date = formatRegisterDate(bill.saleDate);
  if (date) parts.push(date);
  if (bill.showAmount && bill.amount != null) {
    parts.push(
      `₹${bill.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
  }
  return parts.filter(Boolean).join(" · ");
}

/** Same CN-voucher recognition as customerLedgerTransactions (do not widen). */
export function isCreditNoteAdjustmentVoucher(v: CreditNoteSrRegisterVoucher): boolean {
  if (v.voucher_type && v.voucher_type !== "receipt") return false;
  const desc = (v.description || "").toLowerCase();
  return (
    v.payment_method === "credit_note_adjustment" ||
    desc.includes("credit note adjusted") ||
    desc.includes("cn adjusted")
  );
}

export function sumCnVouchersBySaleId(vouchers: CreditNoteSrRegisterVoucher[]): {
  cnVoucherBySaleId: Record<string, number>;
  cnAdjustDateBySaleId: Record<string, string>;
} {
  const cnVoucherBySaleId: Record<string, number> = {};
  const cnAdjustDateBySaleId: Record<string, string> = {};
  const clockKey: Record<string, string> = {};
  for (const v of vouchers) {
    if (!isCreditNoteAdjustmentVoucher(v) || !v.reference_id) continue;
    const saleId = String(v.reference_id);
    cnVoucherBySaleId[saleId] = (cnVoucherBySaleId[saleId] || 0) + (Number(v.total_amount) || 0);
    const voucherDate = String(v.voucher_date || "").slice(0, 10);
    const createdAt = v.created_at ? String(v.created_at) : "";
    const nextKey = `${voucherDate}\t${createdAt}`;
    if (!clockKey[saleId] || nextKey > clockKey[saleId]) {
      clockKey[saleId] = nextKey;
      if (voucherDate) cnAdjustDateBySaleId[saleId] = voucherDate;
    }
  }
  return { cnVoucherBySaleId, cnAdjustDateBySaleId };
}

/**
 * Dashboard vocabulary (SaleReturnDashboard formatCreditStatusLabel) with
 * allocated remaining, not remaining_cn_amt.
 */
export function creditNoteSrRegisterStatusLabel(params: {
  creditStatus?: string | null;
  linkedSaleId?: string | null;
  remainingAmount: number;
}): string {
  const status = (params.creditStatus || "").toLowerCase();
  if (status === "refunded") return "Refunded to Customer";
  if (status === "adjusted_outstanding") return "Adjusted to Customer Outstanding";
  if (status === "partially_adjusted") return "CN Partially Applied to Invoice(s)";
  if (status === "adjusted" && params.linkedSaleId) {
    if (params.remainingAmount > SETTLED_REMAINING) {
      return `S/R Partial — ₹${params.remainingAmount.toLocaleString("en-IN")} CN Remaining`;
    }
    return "S/R Adjusted in Invoice";
  }
  if (status === "adjusted") return "Credit Note Generated";
  if (status === "pending") return "Credit Note Pending";
  return "Pending";
}

export function buildCreditNoteSrRegisterRows(
  source: CreditNoteSrRegisterSource,
): CreditNoteSrRegisterRow[] {
  const { cnVoucherBySaleId, cnAdjustDateBySaleId } = sumCnVouchersBySaleId(source.vouchers);
  const linkedSaleNumberById: Record<string, string | null> = {};
  for (const [id, sale] of Object.entries(source.salesById)) {
    linkedSaleNumberById[id] = sale.sale_number || null;
  }

  const byCustomer = new Map<string, CreditNoteSrRegisterSaleReturn[]>();
  for (const sr of source.saleReturns) {
    const cid = String(sr.customer_id || "").trim() || "_none";
    const list = byCustomer.get(cid) || [];
    list.push(sr);
    byCustomer.set(cid, list);
  }

  const rows: CreditNoteSrRegisterRow[] = [];
  for (const [, group] of byCustomer) {
    const appliedMap = allocateCnAdjustmentsToSaleReturns(
      group,
      cnVoucherBySaleId,
      linkedSaleNumberById,
    );
    for (const sr of group) {
      const amount = Number(sr.net_amount) || 0;
      const appliedInfo = appliedMap[sr.id];
      const appliedAmount = appliedInfo?.applied || 0;
      const linkedSaleId = String(sr.linked_sale_id || "").trim();
      const linkedSale = linkedSaleId ? source.salesById[linkedSaleId] : undefined;
      const absorbedOnInvoice = linkedSale
        ? Math.min(amount, Number(linkedSale.sale_return_adjust || 0))
        : 0;
      const consumedAmount = saleReturnConsumedForRemaining({
        allocatedAmount: appliedAmount,
        absorbedOnLinkedInvoice: absorbedOnInvoice,
        linkedSaleCnVoucherTotal: linkedSaleId ? cnVoucherBySaleId[linkedSaleId] || 0 : 0,
      });
      const remainingAmount = saleReturnRemainingCredit({
        grossNetAmount: amount,
        consumedAmount,
      });
      const isMemo = remainingAmount <= SETTLED_REMAINING && consumedAmount > 0.005;
      const cn = sr.credit_note_id ? source.creditNotesById[sr.credit_note_id] : undefined;
      const customer = sr.customer_id ? source.customersById[sr.customer_id] : undefined;
      const slices = (appliedInfo?.slices || []).filter((slice) => slice.applied > 0.005);
      const redeemedSource =
        slices.length > 0
          ? slices
          : consumedAmount > 0.005 && linkedSaleId
            ? [
                {
                  saleId: linkedSaleId,
                  saleNumber: linkedSale?.sale_number || null,
                  applied: consumedAmount,
                },
              ]
            : [];
      const redeemedBills: CreditNoteSrRedeemedBill[] = [];
      for (const slice of redeemedSource) {
        const sale = source.salesById[slice.saleId];
        const saleNumber = String(slice.saleNumber || sale?.sale_number || "").trim();
        if (!saleNumber) continue;
        redeemedBills.push({
          saleId: slice.saleId,
          saleNumber,
          billKind: saleBillKindLabel(sale?.sale_type),
          saleDate: String(sale?.sale_date || "").slice(0, 10),
          amount: slice.applied,
        });
      }
      const linkedBills: CreditNoteSrRedeemedBill[] = [];
      const seenLinked = new Set<string>();
      const pushLinked = (saleId: string, amount: number) => {
        if (!saleId || seenLinked.has(saleId)) return;
        const sale = source.salesById[saleId];
        const saleNumber = String(sale?.sale_number || "").trim();
        if (!saleNumber) return;
        seenLinked.add(saleId);
        linkedBills.push({
          saleId,
          saleNumber,
          billKind: saleBillKindLabel(sale?.sale_type),
          saleDate: String(sale?.sale_date || "").slice(0, 10),
          amount,
        });
      };
      if (linkedSaleId) pushLinked(linkedSaleId, absorbedOnInvoice);
      for (const bill of redeemedBills) pushLinked(bill.saleId, bill.amount);
      const showSplit = redeemedBills.length > 1;
      let cnAppliedDate: string | null = null;
      for (const bill of redeemedBills) {
        const voucherDate = cnAdjustDateBySaleId[bill.saleId];
        if (voucherDate && (!cnAppliedDate || voucherDate > cnAppliedDate)) cnAppliedDate = voucherDate;
      }
      if (!cnAppliedDate) {
        for (const bill of redeemedBills) {
          if (bill.saleDate && (!cnAppliedDate || bill.saleDate > cnAppliedDate)) {
            cnAppliedDate = bill.saleDate;
          }
        }
      }
      rows.push({
        id: sr.id,
        returnNumber: sr.return_number || "",
        returnDate: String(sr.return_date || "").slice(0, 10),
        customerId: sr.customer_id || "",
        customerName:
          (customer?.customer_name || sr.customer_name || "").trim() || "Walk-in Customer",
        customerPhone: (customer?.phone || "").trim(),
        linkedInvoiceNumbers: linkedBills
          .map((bill) => formatRedeemedBillLabel(bill))
          .join(", "),
        linkedBills,
        netReturnAmount: amount,
        creditNoteNumber: (cn?.credit_note_number || "").trim(),
        creditNoteAmount: Number(cn?.credit_amount) || amount,
        appliedAmount: consumedAmount,
        appliedToInvoices: redeemedBills
          .map((bill) => formatRedeemedBillLabel({ ...bill, showAmount: showSplit }))
          .join(", "),
        redeemedBills,
        remainingAmount,
        consumedAmount,
        cnAppliedDate,
        creditStatus: sr.credit_status || "pending",
        statusLabel: creditNoteSrRegisterStatusLabel({
          creditStatus: sr.credit_status,
          linkedSaleId,
          remainingAmount,
        }),
        isMemo,
      });
    }
  }

  rows.sort((a, b) => {
    const d = a.returnDate.localeCompare(b.returnDate);
    if (d !== 0) return d;
    return a.returnNumber.localeCompare(b.returnNumber);
  });
  return rows;
}

export function filterCreditNoteSrRegisterRows(
  rows: CreditNoteSrRegisterRow[],
  opts: {
    fromDate?: string | null;
    toDate?: string | null;
    dateBasis?: CreditNoteSrDateBasis;
    customerQuery?: string;
    showSettled?: boolean;
  },
): CreditNoteSrRegisterRow[] {
  const from = (opts.fromDate || "").slice(0, 10);
  const to = (opts.toDate || "").slice(0, 10);
  const basis = opts.dateBasis || "return_date";
  const q = (opts.customerQuery || "").trim().toLowerCase();
  const showSettled = opts.showSettled === true;
  return rows.filter((row) => {
    const settled = row.remainingAmount <= SETTLED_REMAINING;
    if (!showSettled && settled) return false;
    if (q) {
      const hay = `${row.customerName} ${row.customerPhone} ${row.returnNumber} ${row.creditNoteNumber} ${row.linkedInvoiceNumbers} ${row.appliedToInvoices}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const dateVal = basis === "cn_applied" ? row.cnAppliedDate || "" : row.returnDate;
    if (basis === "cn_applied" && !dateVal) return false;
    if (from && dateVal && dateVal < from) return false;
    if (to && dateVal && dateVal > to) return false;
    return true;
  });
}

export function creditNoteSrRegisterKpis(rows: CreditNoteSrRegisterRow[]): {
  count: number;
  netReturn: number;
  applied: number;
  remaining: number;
} {
  return rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.netReturn += row.netReturnAmount;
      acc.applied += row.appliedAmount;
      acc.remaining += row.remainingAmount;
      return acc;
    },
    { count: 0, netReturn: 0, applied: 0, remaining: 0 },
  );
}

export function creditNoteSrRegisterCsvHeader(): string[] {
  return [
    "Return No",
    "Return Date",
    "Customer",
    "Phone",
    "Linked Invoice(s)",
    "Net Return Amount",
    "Credit Note No",
    "Credit Note Amount",
    "Amount Applied",
    "Applied To Invoice(s)",
    "CN Applied Date",
    "Remaining / Pending",
    "Status",
    "Bill Type",
    "Invoice Date",
  ];
}

export function creditNoteSrRegisterCsvRow(row: CreditNoteSrRegisterRow): string[] {
  return [
    row.returnNumber,
    row.returnDate,
    row.customerName,
    row.customerPhone,
    row.linkedInvoiceNumbers,
    row.netReturnAmount.toFixed(2),
    row.creditNoteNumber,
    row.creditNoteAmount.toFixed(2),
    row.appliedAmount.toFixed(2),
    row.appliedToInvoices,
    row.cnAppliedDate || "",
    row.remainingAmount.toFixed(2),
    row.statusLabel,
    row.redeemedBills.map((bill) => bill.billKind).filter(Boolean).join(", "),
    row.redeemedBills.map((bill) => formatRegisterDate(bill.saleDate)).filter(Boolean).join(", "),
  ];
}
