import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeSaleLineRevenue, sumLines, type ProfitLine } from "./netProfitAnalysis";
import {
  NPA_KPI_PARITY_TOLERANCE,
  NPA_NET_PROFIT_CAPTION,
  STORED_NET_CAPTION,
  npaTimestampBounds,
  netProfitKpisFromTotals,
  parseNetProfitKpis,
  type NetProfitKpis,
} from "./netProfitKpis";

const here = dirname(fileURLToPath(import.meta.url));

type SaleMeta = {
  id: string;
  gross_amount: number;
  discount_amount: number;
  flat_discount_amount: number;
  points_redeemed_amount: number;
};

type SaleItem = {
  sale_id: string;
  variant_id: string | null;
  product_id: string;
  product_type: string;
  quantity: number;
  line_total: number;
  unit_price: number;
  mrp: number;
  discount_percent?: number;
  discount_share: number | null;
  round_off_share: number | null;
  net_after_discount: number | null;
};

type PurchaseItem = { sku_id: string; pur_price: number; qty: number };
type Variant = { id: string; pur_price: number };
type ReturnItem = { quantity: number; line_total: number };

function sqlLineGross(item: SaleItem): number {
  const qty = Number(item.quantity) || 0;
  const mrp = Number(item.mrp) || 0;
  const unitP = Number(item.unit_price) || 0;
  const lineTotal = Number(item.line_total) || 0;
  const weighted = qty * (mrp > 0 ? mrp : unitP);
  if (weighted > 0) return weighted;
  if (lineTotal !== 0) return lineTotal;
  return 0;
}

function sqlAvgPur(purchases: PurchaseItem[], variantId: string | null): number | null {
  if (!variantId) return null;
  const rows = purchases.filter((p) => p.sku_id === variantId);
  if (rows.length === 0) return null;
  let total = 0;
  let qty = 0;
  for (const p of rows) {
    const q = Number(p.qty) || 1;
    total += (Number(p.pur_price) || 0) * q;
    qty += q;
  }
  return qty > 0 ? total / qty : null;
}

/** JS port of get_net_profit_kpis CASE math — independent of computeSaleLineRevenue. */
function sqlPortKpis(
  sales: SaleMeta[],
  items: SaleItem[],
  variants: Variant[],
  purchases: PurchaseItem[],
  returns: ReturnItem[],
): NetProfitKpis {
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const mrpBase = new Map<string, number>();
  for (const item of items) {
    if (item.quantity === 0 && item.line_total === 0) continue;
    mrpBase.set(item.sale_id, (mrpBase.get(item.sale_id) || 0) + sqlLineGross(item));
  }

  let gross_sales = 0;
  let discounts = 0;
  let round_off = 0;
  let net_sales = 0;
  let total_cogs = 0;

  for (const item of items) {
    if (item.quantity === 0 && item.line_total === 0) continue;
    const sale = sales.find((s) => s.id === item.sale_id);
    if (!sale) continue;
    const lineGross = sqlLineGross(item);
    const mrpAlloc = mrpBase.get(item.sale_id) || 0;
    const allocBase = mrpAlloc > 0 ? mrpAlloc : Number(sale.gross_amount) || 0;
    const headerItemDisc = Math.max(0, Number(sale.discount_amount) || 0);
    const headerFlat = Math.max(0, Number(sale.flat_discount_amount) || 0);
    const headerPoints = Math.max(0, Number(sale.points_redeemed_amount) || 0);
    const mrpWeight = allocBase > 0 && lineGross > 0 ? lineGross / allocBase : 0;
    const lineDiscount = headerItemDisc > 0 && mrpWeight > 0 ? headerItemDisc * mrpWeight : 0;
    let flatShare: number;
    if (item.discount_share != null && Number.isFinite(Number(item.discount_share)) && Number(item.discount_share) >= 0) {
      flatShare = Number(item.discount_share);
    } else {
      const flatWeight = allocBase > 0 ? Math.max(0, item.line_total) / allocBase : 0;
      flatShare = headerFlat > 0 && flatWeight > 0 ? headerFlat * flatWeight : 0;
    }
    const pointsWeight = allocBase > 0 ? Math.max(0, item.line_total) / allocBase : 0;
    const pointsShare = headerPoints > 0 && pointsWeight > 0 ? headerPoints * pointsWeight : 0;
    const roundOffShare =
      item.round_off_share != null && Number.isFinite(Number(item.round_off_share))
        ? Number(item.round_off_share)
        : 0;
    let netLine: number;
    if (item.net_after_discount != null && Number.isFinite(Number(item.net_after_discount))) {
      netLine = Number(item.net_after_discount);
    } else {
      netLine = item.line_total - flatShare + roundOffShare;
    }
    netLine -= pointsShare;

    let cogs = 0;
    if (item.product_type !== "service" && item.variant_id) {
      const avg = sqlAvgPur(purchases, item.variant_id);
      const fallback = variantMap.get(item.variant_id)?.pur_price || 0;
      const purPrice = avg || fallback || 0;
      cogs = item.quantity * Number(purPrice || 0);
    }

    gross_sales += lineGross;
    discounts += lineDiscount + flatShare + pointsShare;
    round_off += roundOffShare;
    net_sales += netLine;
    total_cogs += cogs;
  }

  const return_amount = returns
    .filter((r) => !(r.quantity === 0 && r.line_total === 0))
    .reduce((s, r) => s + Math.abs(r.line_total), 0);
  const gross_profit = net_sales - total_cogs;
  return {
    gross_sales,
    discounts,
    round_off,
    net_sales,
    return_amount,
    total_cogs,
    gross_profit,
    margin_percent: net_sales !== 0 ? (gross_profit / net_sales) * 100 : 0,
    invoice_count: sales.length,
  };
}

function engineKpis(
  sales: SaleMeta[],
  items: SaleItem[],
  variants: Variant[],
  purchases: PurchaseItem[],
  returns: ReturnItem[],
): NetProfitKpis {
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const avgMap = new Map<string, number>();
  for (const v of variants) {
    const avg = sqlAvgPur(purchases, v.id);
    if (avg != null) avgMap.set(v.id, avg);
  }
  const mrpBase = new Map<string, number>();
  for (const item of items) {
    if (item.quantity === 0 && item.line_total === 0) continue;
    mrpBase.set(item.sale_id, (mrpBase.get(item.sale_id) || 0) + sqlLineGross(item));
  }
  const lines: ProfitLine[] = [];
  for (const item of items) {
    if (item.quantity === 0 && item.line_total === 0) continue;
    const sale = sales.find((s) => s.id === item.sale_id);
    const rev = computeSaleLineRevenue(
      { ...item, discount_percent: item.discount_percent ?? 0 }, sale
      ? {
          gross_amount: sale.gross_amount,
          mrp_allocation_base: mrpBase.get(item.sale_id) || 0,
          discount_amount: sale.discount_amount,
          flat_discount_amount: sale.flat_discount_amount,
          points_redeemed_amount: sale.points_redeemed_amount,
          sale_return_adjust: 9950,
        }
      : undefined);
    const isService = item.product_type === "service";
    let cogs = 0;
    if (!isService && item.variant_id) {
      const purPrice = avgMap.get(item.variant_id) || variantMap.get(item.variant_id)?.pur_price || 0;
      cogs = item.quantity * Number(purPrice || 0);
    }
    lines.push({
      qty: item.quantity,
      grossSales: rev.grossLine,
      totalDiscounts: Math.max(0, rev.lineDiscount + rev.flatShare),
      roundOff: rev.roundOffShare,
      netSales: rev.netLine,
      totalCOGS: cogs,
      zeroCostQty: 0,
      sign: 1,
      returnQty: 0,
      returnAmount: 0,
      supplierId: null,
      supplierName: "Unknown",
      productId: item.product_id,
      productName: "P",
      brand: null,
      category: null,
      style: null,
      size: null,
      color: null,
      hsn: null,
      productType: item.product_type,
      saleId: item.sale_id,
      saleNumber: "POS/26-27/1",
      saleDate: "2026-09-16T10:00:00",
      customerId: null,
      customerName: "Walk-in",
      salesman: null,
      paymentMethod: "cash",
    });
  }
  for (const r of returns) {
    if (r.quantity === 0 && r.line_total === 0) continue;
    lines.push({
      qty: 0,
      grossSales: 0,
      totalDiscounts: 0,
      roundOff: 0,
      netSales: 0,
      totalCOGS: 0,
      zeroCostQty: 0,
      sign: -1,
      returnQty: r.quantity,
      returnAmount: Math.abs(r.line_total),
      supplierId: null,
      supplierName: "Unknown",
      productId: "r",
      productName: "Return",
      brand: null,
      category: null,
      style: null,
      size: null,
      color: null,
      hsn: null,
      productType: "goods",
      saleId: null,
      saleNumber: "RET",
      saleDate: "2026-09-16T12:00:00",
      customerId: null,
      customerName: "Walk-in",
      salesman: null,
      paymentMethod: "cash",
    });
  }
  return netProfitKpisFromTotals(sumLines(lines), sales.length);
}

function expectWithinTolerance(sql: NetProfitKpis, engine: NetProfitKpis) {
  const keys: (keyof NetProfitKpis)[] = [
    "gross_sales",
    "discounts",
    "round_off",
    "net_sales",
    "return_amount",
    "total_cogs",
    "gross_profit",
    "margin_percent",
  ];
  for (const key of keys) {
    expect(Math.abs(Number(sql[key]) - Number(engine[key])), key).toBeLessThanOrEqual(
      NPA_KPI_PARITY_TOLERANCE,
    );
  }
  expect(sql.invoice_count).toBe(engine.invoice_count);
}

describe("npaTimestampBounds", () => {
  it("matches loadProfitDataset PostgREST strings", () => {
    expect(npaTimestampBounds("2026-09-16", "2026-09-16")).toEqual({
      fromTimestamp: "2026-09-16",
      toTimestamp: "2026-09-16T23:59:59",
    });
  });
});

describe("get_net_profit_kpis SQL port vs sumLines", () => {
  const sales: SaleMeta[] = [
    {
      id: "s1",
      gross_amount: 1000,
      discount_amount: 100,
      flat_discount_amount: 50,
      points_redeemed_amount: 0,
    },
    {
      id: "s2",
      gross_amount: 400,
      discount_amount: 0,
      flat_discount_amount: 0,
      points_redeemed_amount: 0,
    },
  ];
  const items: SaleItem[] = [
    {
      sale_id: "s1",
      variant_id: "v1",
      product_id: "p1",
      product_type: "goods",
      quantity: 2,
      line_total: 450,
      unit_price: 450,
      mrp: 500,
      discount_share: 50,
      round_off_share: 1.5,
      net_after_discount: 401.5,
    },
    {
      sale_id: "s1",
      variant_id: "v2",
      product_id: "p2",
      product_type: "goods",
      quantity: 1,
      line_total: 450,
      unit_price: 450,
      mrp: 500,
      discount_share: 0,
      round_off_share: -0.5,
      net_after_discount: 449.5,
    },
    {
      sale_id: "s2",
      variant_id: "v3",
      product_id: "p3",
      product_type: "service",
      quantity: 1,
      line_total: 400,
      unit_price: 400,
      mrp: 400,
      discount_share: 0,
      round_off_share: 0,
      net_after_discount: 400,
    },
    {
      sale_id: "s1",
      variant_id: "v1",
      product_id: "p1",
      product_type: "goods",
      quantity: 0,
      line_total: 0,
      unit_price: 0,
      mrp: 0,
      discount_share: 0,
      round_off_share: 0,
      net_after_discount: 0,
    },
  ];
  const variants: Variant[] = [
    { id: "v1", pur_price: 999 },
    { id: "v2", pur_price: 200 },
    { id: "v3", pur_price: 50 },
  ];
  const purchases: PurchaseItem[] = [
    { sku_id: "v1", pur_price: 100, qty: 3 },
    { sku_id: "v1", pur_price: 200, qty: 1 },
  ];
  const returns: ReturnItem[] = [{ quantity: 1, line_total: 12610.5 }];

  it("stays within ₹0.5 of sumLines on mixed disc / COGS / service / returns", () => {
    const sql = sqlPortKpis(sales, items, variants, purchases, returns);
    const engine = engineKpis(sales, items, variants, purchases, returns);
    expectWithinTolerance(sql, engine);
    expect(sql.return_amount).toBe(12610.5);
    expect(sql.net_sales).toBe(engine.net_sales);
    expect(sql.total_cogs).toBeGreaterThan(0);
    // Service line must not use variant.pur_price.
    const withoutServicePurchases = sqlPortKpis(sales, items, variants, purchases, []);
    const goodsOnly = sqlPortKpis(
      sales.filter((s) => s.id === "s1"),
      items.filter((i) => i.sale_id === "s1"),
      variants,
      purchases,
      [],
    );
    expect(Math.abs(withoutServicePurchases.total_cogs - goodsOnly.total_cogs)).toBeLessThanOrEqual(
      NPA_KPI_PARITY_TOLERANCE,
    );
  });

  it("does not net returns into NPA net / COGS / profit", () => {
    const withReturns = sqlPortKpis(sales, items, variants, purchases, returns);
    const withoutReturns = sqlPortKpis(sales, items, variants, purchases, []);
    expect(withReturns.net_sales).toBe(withoutReturns.net_sales);
    expect(withReturns.total_cogs).toBe(withoutReturns.total_cogs);
    expect(withReturns.gross_profit).toBe(withoutReturns.gross_profit);
    expect(withReturns.return_amount).toBeGreaterThan(withoutReturns.return_amount);
  });

  it("uses qty-weighted purchase avg, not current variant.pur_price", () => {
    const sql = sqlPortKpis(sales, items, variants, purchases, []);
    // v1 avg = (100*3 + 200*1) / 4 = 125; qty 2 → 250. v2 fallback 200.
    expect(sql.total_cogs).toBe(450);
    expect(sql.total_cogs).not.toBe(2 * 999 + 200);
  });
});

describe("parseNetProfitKpis", () => {
  it("coerces JSON numbers", () => {
    const kpis = parseNetProfitKpis({
      gross_sales: "100.5",
      discounts: 10,
      round_off: -0.5,
      net_sales: 90,
      return_amount: 5,
      total_cogs: 40,
      gross_profit: 50,
      margin_percent: 55.555,
      invoice_count: 3,
    });
    expect(kpis.net_sales).toBe(90);
    expect(kpis.invoice_count).toBe(3);
  });
});

describe("get_net_profit_kpis migration", () => {
  const sql = readFileSync(
    join(here, "../../supabase/migrations/20261220120000_get_net_profit_kpis.sql"),
    "utf8",
  );

  it("adds totals-only RPC and drops the dashboard view profit read", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_net_profit_kpis");
    expect(sql).toMatch(/T23:59:59/);
    expect(sql).toContain("'gross_profit', NULL");
    expect(sql).not.toMatch(/FROM v_dashboard_gross_profit/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public.get_net_profit_kpis/);
  });

  it("keeps stored-net vs NPA-net labels as the UI contract", () => {
    expect(STORED_NET_CAPTION).toMatch(/Stored net/i);
    expect(NPA_NET_PROFIT_CAPTION).toMatch(/NPA net/i);
    expect(NPA_NET_PROFIT_CAPTION).toMatch(/before returns/i);
  });
});
