export type PurchaseReturnTaxType = "exclusive" | "inclusive" | "dc";

export interface PurchaseReturnLineInput {
  qty: number;
  pur_price: number;
  line_total: number;
  gst_per: number;
  product_id: string;
  sku_id: string;
  size: string;
  color?: string | null;
  hsn_code?: string | null;
  barcode?: string | null;
}

export interface PurchaseReturnTotals {
  grossAmount: number;
  gstAmount: number;
  netAmount: number;
}

export function calculatePurchaseReturnTotals(
  lineItems: Array<Pick<PurchaseReturnLineInput, "line_total" | "gst_per">>,
  taxType: PurchaseReturnTaxType,
  discountAmount: number
): PurchaseReturnTotals {
  const lineTotal = lineItems.reduce((sum, r) => sum + (Number(r.line_total) || 0), 0);
  const discount = Number(discountAmount) || 0;

  if (taxType === "exclusive") {
    const gross = lineTotal;
    const discountedGross = gross - discount;
    const gst = lineItems.reduce((sum, r) => {
      const itemDiscountedTotal = gross > 0 ? (Number(r.line_total) || 0) - (((Number(r.line_total) || 0) / gross) * discount) : 0;
      return sum + (itemDiscountedTotal * (Number(r.gst_per) || 0) / 100);
    }, 0);
    return { grossAmount: gross, gstAmount: gross > 0 ? gst : 0, netAmount: discountedGross + (gross > 0 ? gst : 0) };
  }

  if (taxType === "inclusive") {
    let totalGross = 0;
    let totalGst = 0;
    lineItems.forEach((item) => {
      const inclusiveTotal = Number(item.line_total) || 0;
      const gstRate = (Number(item.gst_per) || 0) / 100;
      const baseAmount = inclusiveTotal / (1 + gstRate);
      const gstAmt = inclusiveTotal - baseAmount;
      totalGross += baseAmount;
      totalGst += gstAmt;
    });
    const discountRatio = lineTotal > 0 ? discount / lineTotal : 0;
    const adjustedGross = totalGross * (1 - discountRatio);
    const adjustedGst = totalGst * (1 - discountRatio);
    return { grossAmount: totalGross, gstAmount: adjustedGst, netAmount: adjustedGross + adjustedGst };
  }

  const gross = lineTotal;
  return { grossAmount: gross, gstAmount: 0, netAmount: gross - discount };
}

export function buildPurchaseReturnItemPayload(item: PurchaseReturnLineInput, isDC: boolean) {
  return {
    product_id: item.product_id,
    sku_id: item.sku_id,
    size: item.size,
    color: item.color || null,
    qty: item.qty,
    pur_price: item.pur_price,
    gst_per: isDC ? 0 : item.gst_per,
    is_dc: isDC,
    hsn_code: item.hsn_code || null,
    barcode: item.barcode || null,
    line_total: item.line_total,
  };
}


/**
 * Line discount is not stored on purchase_return_items; line_total is saved after
 * discount, so the discount is the gap between qty × rate and line_total.
 */
export function derivePurchaseReturnLineDiscount(item: {
  qty: number;
  pur_price: number;
  line_total: number;
}): { discount_amount: number; discount_percent: number } {
  const base = (Number(item.qty) || 0) * (Number(item.pur_price) || 0);
  const gap = Math.round((base - (Number(item.line_total) || 0)) * 100) / 100;
  if (base <= 0 || gap <= 0.005) return { discount_amount: 0, discount_percent: 0 };
  return {
    discount_amount: gap,
    discount_percent: Math.round((gap / base) * 10000) / 100,
  };
}
