/**
 * Structural rows for a supplier payment.
 *
 * WHY THIS EXISTS
 * A supplier payment voucher is only unambiguous if `reference_id` says what it settles:
 *   reference_id = bill.id      -> cash against that specific bill
 *   reference_id = supplier.id  -> genuine on-account / opening-balance payment
 *
 * FloatingPayments used to bump `purchase_bills.paid_amount` for each selected bill and
 * then write ONE voucher against the SUPPLIER id. The reader
 * (`supplierBalanceUtils.computeSupplierTotalPaid`) could only tell those two cases apart
 * by pattern-matching the description:
 *
 *     desc.includes(billRef) && /Payment for Bill/i.test(desc)
 *
 * The description is user-editable — FloatingPayments used `description || <default>`, so
 * any custom note ("June payment") replaced the default text entirely. The voucher then
 * failed the pattern, was treated as on-account, and was added ON TOP of the same cash
 * already sitting in `bill.paid_amount` — double counted. The mirror case (a genuine
 * on-account payment whose note happened to match, or whose bill was later removed) was
 * skipped as a duplicate and silently lost.
 *
 * Building one row per bill removes the ambiguity at the source: the link is the
 * reference_id, never the prose.
 */

export type SupplierPaymentBill = {
  id: string;
  net_amount?: number | null;
  paid_amount?: number | null;
  software_bill_no?: string | null;
  supplier_invoice_no?: string | null;
};

export type SupplierPaymentAllocation = {
  bill: SupplierPaymentBill;
  amountApplied: number;
};

export type SupplierPaymentVoucherRow = {
  /** bill.id for bill-linked cash, supplier id for on-account. */
  referenceId: string;
  amount: number;
  /** Suffix appended to the base voucher number when a payment spans several bills. */
  voucherNumberSuffix: string;
  kind: "bill" | "on_account";
  billRef: string | null;
};

export function billDisplayRef(bill: SupplierPaymentBill): string {
  return (
    bill.software_bill_no ||
    bill.supplier_invoice_no ||
    bill.id.slice(0, 8)
  );
}

/** Round to paise so repeated float subtraction cannot leave a 0.0000001 remainder row. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Split a supplier payment into structurally-linked voucher rows.
 *
 * - One `bill` row per bill the payment was applied to (`referenceId = bill.id`).
 * - One `on_account` row for anything left over (`referenceId = supplierId`), which is a
 *   real advance and must stay on the supplier.
 * - A payment with no bills selected stays a single `on_account` row (opening balance).
 */
export function buildSupplierPaymentVoucherRows(input: {
  supplierId: string;
  paymentAmount: number;
  allocations: SupplierPaymentAllocation[];
}): SupplierPaymentVoucherRow[] {
  const { supplierId, paymentAmount, allocations } = input;

  const applied = allocations.filter((a) => round2(a.amountApplied) > 0);
  const rows: SupplierPaymentVoucherRow[] = [];

  const multi = applied.length > 1 || (applied.length >= 1 && round2(paymentAmount) > round2(applied.reduce((s, a) => s + a.amountApplied, 0)));

  applied.forEach((a, i) => {
    rows.push({
      referenceId: a.bill.id,
      amount: round2(a.amountApplied),
      voucherNumberSuffix: multi ? `-${i + 1}` : "",
      kind: "bill",
      billRef: billDisplayRef(a.bill),
    });
  });

  const appliedTotal = round2(applied.reduce((sum, a) => sum + a.amountApplied, 0));
  const remainder = round2(round2(paymentAmount) - appliedTotal);

  if (remainder > 0) {
    rows.push({
      referenceId: supplierId,
      amount: remainder,
      voucherNumberSuffix: multi ? `-${rows.length + 1}` : "",
      kind: "on_account",
      billRef: null,
    });
  }

  return rows;
}

/**
 * Description for a voucher row. The user's own note is preserved, but it can no longer
 * change how the row is counted — that is decided by `referenceId`.
 */
export function supplierPaymentVoucherDescription(input: {
  row: SupplierPaymentVoucherRow;
  userDescription: string;
  supplierName: string;
  paymentDetails: string;
}): string {
  const { row, userDescription, supplierName, paymentDetails } = input;
  const note = userDescription.trim();

  const base =
    row.kind === "bill"
      ? `Payment for Bill: ${row.billRef} | Supplier: ${supplierName}`
      : `On-account payment to ${supplierName}`;

  return note ? `${note} | ${base}${paymentDetails}` : `${base}${paymentDetails}`;
}
