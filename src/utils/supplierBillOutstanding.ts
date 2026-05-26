/** Minimum rupee to treat a bill as still payable (matches customer MIN_PENDING). */
export const SUPPLIER_MIN_PENDING_RUPEE = 0.01;

export type SupplierBillRow = {
  id: string;
  net_amount?: number | null;
  paid_amount?: number | null;
  bill_date?: string | null;
};

export type SupplierBillOutstandingBreakdown = {
  rawOutstanding: number;
  creditAllocated: number;
  netPayable: number;
};

/** Bill-level due before supplier-level CN / adjusted-outstanding pool. */
export function getSupplierBillRawOutstanding(
  bill: SupplierBillRow,
  voucherPaidByBillId?: Map<string, number>,
): number {
  const net = Number(bill.net_amount || 0);
  const paid = Math.max(
    Number(bill.paid_amount || 0),
    Number(voucherPaidByBillId?.get(bill.id) || 0),
  );
  return Math.max(0, net - paid);
}

/**
 * FIFO-allocate supplier credit (unapplied CN vouchers + adjusted_outstanding returns)
 * against oldest bills first — mirrors customer invoice list after sale_return_adjust.
 */
export function allocateSupplierCreditToBills(
  bills: SupplierBillRow[],
  creditPool: number,
  voucherPaidByBillId?: Map<string, number>,
): Map<string, SupplierBillOutstandingBreakdown> {
  const map = new Map<string, SupplierBillOutstandingBreakdown>();
  let remaining = Math.max(0, roundMoney(creditPool));

  const sorted = [...bills].sort((a, b) => {
    const da = a.bill_date ? new Date(a.bill_date).getTime() : 0;
    const db = b.bill_date ? new Date(b.bill_date).getTime() : 0;
    return da - db;
  });

  for (const bill of sorted) {
    const raw = roundMoney(getSupplierBillRawOutstanding(bill, voucherPaidByBillId));
    const creditAllocated = roundMoney(Math.min(raw, remaining));
    remaining = roundMoney(remaining - creditAllocated);
    const netPayable = roundMoney(Math.max(0, raw - creditAllocated));
    map.set(bill.id, { rawOutstanding: raw, creditAllocated, netPayable });
  }

  return map;
}

export function sumSupplierBillNetPayable(
  breakdown: Map<string, SupplierBillOutstandingBreakdown>,
): number {
  let sum = 0;
  breakdown.forEach((b) => {
    sum += b.netPayable;
  });
  return roundMoney(sum);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
