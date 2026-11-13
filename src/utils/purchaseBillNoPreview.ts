/**
 * Purchase Entry "Software Bill No" box on a new bill: the next number after the last saved
 * PUR/yy-yy/n bill, or PUR/<financial year of the bill date>/1 when there is none (or its number
 * is not in that form). The real number is given on save; this is a preview.
 */
export function previewNextPurchaseBillNo(lastBillNo: string | null | undefined, billDate: Date | null | undefined): string {
  if (lastBillNo) {
    const match = lastBillNo.match(/^(PUR\/\d{2}-\d{2}\/)(\d+)$/);
    if (match) return `${match[1]}${Number(match[2]) + 1}`;
  }
  const now = billDate || new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear() % 100;
  const fy = m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  return `PUR/${fy}/1`;
}
