/**
 * purchase_items has no discount_percent / discount_amount columns
 * (generated types + live Postgres). Line discount is stored in line_total.
 */

const LINE_DISC_EPS = 0.005;

export function inferPurchaseLineDiscount(opts: {
  purchasedQty: number;
  returnQty: number;
  purPrice: number;
  storedLineTotal: number;
}): { discount_percent: number; discount_amount: number; line_total: number } {
  const purchasedQty = Math.max(0, Number(opts.purchasedQty) || 0);
  const returnQty = Math.max(0, Number(opts.returnQty) || 0);
  const purPrice = Number(opts.purPrice) || 0;
  const storedLineTotal = Number(opts.storedLineTotal) || 0;
  const purchasedBase = purchasedQty * purPrice;
  const returnBase = returnQty * purPrice;

  let discount_amount = 0;
  const implied = purchasedBase - storedLineTotal;
  if (purchasedQty > 0 && implied > LINE_DISC_EPS) {
    discount_amount = (implied * returnQty) / purchasedQty;
  }

  const discount_percent = returnBase > 0 ? (discount_amount / returnBase) * 100 : 0;
  return {
    discount_percent,
    discount_amount,
    line_total: returnBase - discount_amount,
  };
}
