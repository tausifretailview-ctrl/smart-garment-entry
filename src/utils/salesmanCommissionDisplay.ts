/**
 * Display helpers for salesman commission: net sale after discount.
 * Commission % applies to net (after line discount), not gross.
 */

export type SaleItemDiscountRow = {
  sale_id: string;
  product_id: string | null;
  product_name?: string | null;
  line_total?: number | null;
  discount_share?: number | null;
  net_after_discount?: number | null;
  discount_percent?: number | null;
};

export type CommissionDisplayRow = {
  id: string;
  sale_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  sale_amount?: number | null;
  commission_percent?: number | null;
  commission_amount?: number | null;
  payment_status?: string | null;
  employee_name?: string | null;
  [key: string]: unknown;
};

export type EnrichedCommissionRow = CommissionDisplayRow & {
  grossSale: number;
  discountAmount: number;
  netSale: number;
  /** Commission on netSale × rate — use for UI / export / summary */
  displayCommission: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveLineGrossAndDiscount(item: SaleItemDiscountRow | null | undefined, fallbackSaleAmount: number) {
  const lineTotal = Number(item?.line_total);
  const netAfter = Number(item?.net_after_discount);
  const discShare = Number(item?.discount_share);

  let gross = Number.isFinite(lineTotal) ? lineTotal : Number(fallbackSaleAmount) || 0;
  let discount = 0;
  let net = gross;

  if (Number.isFinite(netAfter) && netAfter >= 0) {
    net = netAfter;
    if (Number.isFinite(discShare) && discShare >= 0) {
      discount = discShare;
      if (!Number.isFinite(lineTotal)) gross = round2(net + discount);
    } else if (Number.isFinite(lineTotal)) {
      discount = Math.max(0, round2(lineTotal - netAfter));
    }
  } else if (Number.isFinite(discShare) && discShare >= 0) {
    discount = discShare;
    net = Math.max(0, round2(gross - discount));
  }

  return {
    grossSale: round2(gross),
    discountAmount: round2(discount),
    netSale: round2(net),
  };
}

export function commissionOnNet(netSale: number, commissionPercent: number): number {
  return round2((Math.max(0, netSale) * (Number(commissionPercent) || 0)) / 100);
}

function itemKey(saleId: string | null | undefined, productId: string | null | undefined, productName?: string | null) {
  return `${saleId || ""}|${productId || ""}|${(productName || "").toLowerCase()}`;
}

/** Match commission rows to sale_items for discount / net enrichment. */
export function enrichCommissionsWithSaleItems(
  commissions: CommissionDisplayRow[],
  saleItems: SaleItemDiscountRow[],
): EnrichedCommissionRow[] {
  const bySaleProduct = new Map<string, SaleItemDiscountRow[]>();
  for (const item of saleItems) {
    const k = itemKey(item.sale_id, item.product_id, item.product_name);
    const list = bySaleProduct.get(k) || [];
    list.push(item);
    bySaleProduct.set(k, list);
  }
  // Also index by sale_id + product_id only (name may drift)
  const bySaleProductId = new Map<string, SaleItemDiscountRow[]>();
  for (const item of saleItems) {
    const k = `${item.sale_id || ""}|${item.product_id || ""}`;
    const list = bySaleProductId.get(k) || [];
    list.push(item);
    bySaleProductId.set(k, list);
  }

  const used = new WeakSet<object>();

  const takeMatch = (c: CommissionDisplayRow): SaleItemDiscountRow | null => {
    const k1 = itemKey(c.sale_id, c.product_id, c.product_name as string | null);
    const list1 = bySaleProduct.get(k1) || [];
    const free1 = list1.find((i) => !used.has(i));
    if (free1) {
      used.add(free1);
      return free1;
    }
    const k2 = `${c.sale_id || ""}|${c.product_id || ""}`;
    const list2 = bySaleProductId.get(k2) || [];
    const free2 = list2.find((i) => !used.has(i));
    if (free2) {
      used.add(free2);
      return free2;
    }
    return null;
  };

  return commissions.map((c) => {
    const match = takeMatch(c);
    const { grossSale, discountAmount, netSale } = resolveLineGrossAndDiscount(
      match,
      Number(c.sale_amount) || 0,
    );
    const rate = Number(c.commission_percent) || 0;
    return {
      ...c,
      grossSale,
      discountAmount,
      netSale,
      displayCommission: commissionOnNet(netSale, rate),
    };
  });
}
