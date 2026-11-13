/** Purchase Entry footer: the bill discount shown both as % and as ₹ of the gross amount. */

/** Bill Disc % box: the ₹ discount as a percent of gross, 2 decimals; blank when 0 or no gross. */
export function purchaseBillDiscountPercent(discountAmount: number, grossAmount: number): number | "" {
  if (!(grossAmount > 0)) return "";
  return Number(((discountAmount / grossAmount) * 100).toFixed(2)) || "";
}

/** ₹ discount for a typed percent of gross, rounded to paise. */
export function purchaseBillDiscountFromPercent(percent: number, grossAmount: number): number {
  return Math.round(((grossAmount * percent) / 100) * 100) / 100;
}
