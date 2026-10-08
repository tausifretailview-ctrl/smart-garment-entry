/**
 * POS print figures that differ from the on-screen totals engine.
 *
 * The Cr box (customer credit notes) is saved through the same credit-note path
 * as S/R Adj, so the saved bill carries both in `sale_return_adjust`. The print
 * used to show Cr as a "Credit" tender instead: POS/26-27/230 (bill ₹4,300,
 * CN ₹3,600, cash ₹700) printed CASH ₹113.95 + CREDIT ₹586.05 and no CN line.
 */
export function posPrintSaleReturnAdjust(saleReturnAdjust: number, creditApplied: number): number {
  const total = (Number(saleReturnAdjust) || 0) + (Number(creditApplied) || 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

/**
 * Receipts list Discount on its own line under Subtotal, so Subtotal is gross
 * (MRP total), the same figure reprints and the WhatsApp PDF use from
 * `gross_amount`. The live cart `subtotal` is already after line discounts and
 * printed Subtotal ₹4,300 − Discount ₹500 for a ₹4,300 bill.
 */
export function posPrintTotals<T extends { mrp: number; subtotal: number }>(totals: T): T {
  return { ...totals, subtotal: totals.mrp };
}
