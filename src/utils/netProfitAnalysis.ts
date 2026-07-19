/**
 * Shared Net Profit Analysis engine.
 * Loads sale + return lines once, then aggregates by any dimension client-side.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllSaleItems,
  fetchAllPurchaseItems,
  fetchSaleReturnItemsByIds,
  fetchProductsByIds,
} from "@/utils/fetchAllRows";

export type NetProfitFieldDimension =
  | "brand"
  | "category"
  | "style"
  | "size"
  | "color"
  | "hsn"
  | "product_type"
  | "payment_method"
  | "sale_date";

export type NetProfitTab =
  | "supplier-wise"
  | "product-wise"
  | "bill-wise"
  | "customer-wise"
  | "salesman-wise"
  | "field-wise";

export interface ProfitLine {
  qty: number;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalCOGS: number;
  zeroCostQty: number;
  /** +1 sale line, -1 return line */
  sign: 1 | -1;
  supplierId: string | null;
  supplierName: string;
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  style: string | null;
  size: string | null;
  color: string | null;
  hsn: string | null;
  productType: string;
  saleId: string | null;
  saleNumber: string | null;
  saleDate: string | null;
  customerId: string | null;
  customerName: string;
  salesman: string | null;
  paymentMethod: string | null;
}

export interface ProfitAggregateRow {
  key: string;
  label: string;
  secondary?: string | null;
  tertiary?: string | null;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  itemsSold: number;
  zeroCostQty: number;
}

export interface ProfitDataset {
  lines: ProfitLine[];
  totals: Omit<ProfitAggregateRow, "key" | "label" | "secondary" | "tertiary">;
}

const BLANK = "(Blank)";

/** Per sale_item: gross, discounts, and net (includes round-off; matches net_after_discount on save). */
export function computeSaleLineRevenue(
  item: {
    quantity: number;
    line_total: number;
    unit_price: number;
    mrp: number;
    discount_percent: number;
    discount_share?: number | null;
    round_off_share?: number | null;
    net_after_discount?: number | null;
    sale_id: string;
  },
  saleMeta: { gross_amount: number; flat_discount_amount: number } | undefined,
): { grossLine: number; flatShare: number; roundOffShare: number; netLine: number; lineDiscount: number } {
  const qty = Number(item.quantity) || 0;
  const lineTotal = Number(item.line_total) || 0;
  const unitP = Number(item.unit_price) || 0;
  const mrp = Number(item.mrp) || 0;
  const dPct = Number(item.discount_percent) || 0;

  let lineGross = qty * (mrp > 0 ? mrp : unitP);
  if (mrp <= 0 && dPct > 0 && dPct < 100) {
    const reconstructed = lineTotal / (1 - dPct / 100);
    if (Math.abs(reconstructed) > Math.abs(lineGross) && Number.isFinite(reconstructed)) {
      lineGross = Math.round(reconstructed * 100) / 100;
    }
  }

  const lineDiscount = lineGross - lineTotal;

  let flatShare: number;
  if (item.discount_share != null && Number.isFinite(Number(item.discount_share))) {
    flatShare = Number(item.discount_share);
  } else {
    const g = saleMeta?.gross_amount ?? 0;
    const flat = saleMeta?.flat_discount_amount ?? 0;
    flatShare = g > 0 && flat !== 0 ? (lineTotal / g) * flat : 0;
  }

  const roundOffShare =
    item.round_off_share != null && Number.isFinite(Number(item.round_off_share))
      ? Number(item.round_off_share)
      : 0;

  let netLine: number;
  if (item.net_after_discount != null && Number.isFinite(Number(item.net_after_discount))) {
    netLine = Number(item.net_after_discount);
  } else {
    netLine = lineTotal - flatShare + roundOffShare;
  }

  return { grossLine: lineGross, flatShare, roundOffShare, netLine, lineDiscount };
}

type VariantCostMaps = {
  variantMap: Map<string, { id: string; pur_price: number | null; product_id: string }>;
  variantPurchasePriceMap: Map<string, number>;
  variantToSupplier: Map<string, { id: string | null; name: string }>;
};

async function buildVariantCostMaps(
  organizationId: string,
  variantIds: string[],
): Promise<VariantCostMaps> {
  const allVariants: { id: string; pur_price: number | null; product_id: string }[] = [];
  const variantBatchSize = 500;
  for (let i = 0; i < variantIds.length; i += variantBatchSize) {
    const batchIds = variantIds.slice(i, i + variantBatchSize);
    const { data: batchVariants } = await supabase
      .from("product_variants")
      .select("id, pur_price, product_id")
      .eq("organization_id", organizationId)
      .in("id", batchIds);
    if (batchVariants) allVariants.push(...batchVariants);
  }
  const variantMap = new Map(allVariants.map((v) => [v.id, v]));

  const purchaseItems = await fetchAllPurchaseItems(variantIds);
  const purPriceAccum: Record<string, { total: number; qty: number }> = {};
  purchaseItems?.forEach((pi: any) => {
    if (!pi.sku_id) return;
    if (!purPriceAccum[pi.sku_id]) purPriceAccum[pi.sku_id] = { total: 0, qty: 0 };
    const qty = Number(pi.qty) || 1;
    purPriceAccum[pi.sku_id].total += (Number(pi.pur_price) || 0) * qty;
    purPriceAccum[pi.sku_id].qty += qty;
  });
  const variantPurchasePriceMap = new Map<string, number>();
  Object.entries(purPriceAccum).forEach(([skuId, acc]) => {
    variantPurchasePriceMap.set(skuId, acc.qty > 0 ? acc.total / acc.qty : 0);
  });

  const billIds = [...new Set(purchaseItems?.map((pi) => pi.bill_id).filter(Boolean) || [])];
  let purchaseBills: { id: string; supplier_id: string | null; supplier_name: string }[] | null = null;
  if (billIds.length > 0) {
    const { data } = await supabase
      .from("purchase_bills")
      .select("id, supplier_id, supplier_name")
      .eq("organization_id", organizationId)
      .in("id", billIds);
    purchaseBills = data;
  }

  const variantToSupplier = new Map<string, { id: string | null; name: string }>();
  purchaseItems?.forEach((pi) => {
    if (!variantToSupplier.has(pi.sku_id)) {
      const bill = purchaseBills?.find((pb) => pb.id === pi.bill_id);
      if (bill) {
        variantToSupplier.set(pi.sku_id, { id: bill.supplier_id, name: bill.supplier_name });
      }
    }
  });

  return { variantMap, variantPurchasePriceMap, variantToSupplier };
}

function lineCogs(
  qty: number,
  variantId: string | null | undefined,
  productType: string,
  maps: Pick<VariantCostMaps, "variantMap" | "variantPurchasePriceMap">,
): { cogs: number; purPrice: number; isService: boolean } {
  const isService = productType === "service";
  if (isService || !variantId) {
    return { cogs: 0, purPrice: 0, isService };
  }
  const variant = maps.variantMap.get(variantId);
  const purPrice = maps.variantPurchasePriceMap.get(variantId) || variant?.pur_price || 0;
  return { cogs: qty * Number(purPrice || 0), purPrice: Number(purPrice || 0), isService };
}

function displayOrBlank(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || BLANK;
}

function dayKey(iso: string | null | undefined): string {
  if (!iso) return BLANK;
  return iso.slice(0, 10);
}

/**
 * Load all profit lines for the period (sales + returns). Call once per Generate.
 */
export async function loadProfitDataset(
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<ProfitDataset> {
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, customer_id, customer_name, salesman, payment_method, gross_amount, flat_discount_amount",
    )
    .eq("organization_id", organizationId)
    .gte("sale_date", fromDate)
    .lte("sale_date", `${toDate}T23:59:59`)
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .or("payment_status.is.null,payment_status.neq.cancelled")
    .or("sale_type.is.null,sale_type.neq.sale_return");

  if (salesError) throw salesError;

  type SaleRow = {
    id: string;
    sale_number: string;
    sale_date: string;
    customer_id: string | null;
    customer_name: string;
    salesman: string | null;
    payment_method: string;
    gross_amount: number;
    flat_discount_amount: number;
  };

  const saleRows = (sales || []) as SaleRow[];
  const saleById = new Map(saleRows.map((s) => [s.id, s]));
  const saleByNumber = new Map(saleRows.map((s) => [s.sale_number, s]));

  const saleItems = saleRows.length ? await fetchAllSaleItems(saleRows.map((s) => s.id)) : [];

  const { data: returns, error: returnsError } = await supabase
    .from("sale_returns")
    .select(
      "id, linked_sale_id, original_sale_number, customer_id, customer_name, payment_method, return_date",
    )
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", `${toDate}T23:59:59`)
    .is("deleted_at", null);

  if (returnsError) throw returnsError;

  type ReturnHeader = {
    id: string;
    linked_sale_id: string | null;
    original_sale_number: string | null;
    customer_id: string | null;
    customer_name: string;
    payment_method: string | null;
    return_date: string;
  };

  const returnHeaders = (returns || []) as ReturnHeader[];
  const returnById = new Map(returnHeaders.map((r) => [r.id, r]));

  const returnItems = returnHeaders.length
    ? await fetchSaleReturnItemsByIds(
        returnHeaders.map((r) => r.id),
        "return_id, variant_id, product_id, product_name, quantity, line_total, unit_price, size, color, hsn_code, barcode",
      )
    : [];

  if (saleItems.length === 0 && returnItems.length === 0) {
    return {
      lines: [],
      totals: {
        grossSales: 0,
        totalDiscounts: 0,
        netSales: 0,
        totalCOGS: 0,
        grossProfit: 0,
        marginPercent: 0,
        itemsSold: 0,
        zeroCostQty: 0,
      },
    };
  }

  const variantIds = [
    ...new Set([
      ...saleItems.map((si) => si.variant_id).filter(Boolean),
      ...returnItems.map((ri: any) => ri.variant_id).filter(Boolean),
    ]),
  ] as string[];

  const productIds = [
    ...new Set([
      ...saleItems.map((si) => si.product_id).filter(Boolean),
      ...returnItems.map((ri: any) => ri.product_id).filter(Boolean),
    ]),
  ] as string[];

  const maps = await buildVariantCostMaps(organizationId, variantIds);

  // Also collect product ids from variants when line product_id is missing
  variantIds.forEach((vid) => {
    const pid = maps.variantMap.get(vid)?.product_id;
    if (pid && !productIds.includes(pid)) productIds.push(pid);
  });

  const products = await fetchProductsByIds(
    productIds,
    "id, product_name, brand, category, style, product_type, hsn_code, color",
  );
  const productMap = new Map(
    (products || []).map((p: any) => [
      p.id,
      {
        id: p.id as string,
        product_name: (p.product_name as string) || "",
        brand: (p.brand as string | null) ?? null,
        category: (p.category as string | null) ?? null,
        style: (p.style as string | null) ?? null,
        product_type: (p.product_type as string) || "goods",
        hsn_code: (p.hsn_code as string | null) ?? null,
        color: (p.color as string | null) ?? null,
      },
    ]),
  );

  const lines: ProfitLine[] = [];

  const resolveSupplier = (variantId: string | null | undefined, productType: string) => {
    if (variantId && maps.variantToSupplier.has(variantId)) {
      return maps.variantToSupplier.get(variantId)!;
    }
    if (productType === "service") return { id: null as string | null, name: "Services" };
    return { id: null as string | null, name: "Unknown Supplier" };
  };

  saleItems.forEach((item: any) => {
    const sale = saleById.get(item.sale_id);
    const variant = maps.variantMap.get(item.variant_id);
    const productId = item.product_id || variant?.product_id || "";
    const product = productMap.get(productId);
    const productType = product?.product_type || "goods";
    const isService = productType === "service";

    const qty = Number(item.quantity) || 0;
    const lineTotal = Number(item.line_total) || 0;
    if (qty === 0 && lineTotal === 0) return;

    const meta = sale
      ? {
          gross_amount: Number(sale.gross_amount) || 0,
          flat_discount_amount: Number(sale.flat_discount_amount) || 0,
        }
      : undefined;
    const { grossLine, flatShare, netLine, lineDiscount } = computeSaleLineRevenue(item, meta);
    const { cogs, purPrice } = lineCogs(qty, item.variant_id, productType, maps);
    const supplier = resolveSupplier(item.variant_id, productType);

    lines.push({
      qty,
      grossSales: grossLine,
      totalDiscounts: lineDiscount + flatShare,
      netSales: netLine,
      totalCOGS: cogs,
      zeroCostQty: !isService && purPrice === 0 && qty > 0 ? qty : 0,
      sign: 1,
      supplierId: supplier.id,
      supplierName: supplier.name,
      productId: productId || item.product_name || "unknown",
      productName:
        item.product_name || product?.product_name || (isService ? "Service" : "Unknown Product"),
      brand: product?.brand ?? null,
      category: product?.category ?? null,
      style: product?.style ?? null,
      size: item.size ?? null,
      color: item.color ?? product?.color ?? null,
      hsn: item.hsn_code ?? product?.hsn_code ?? null,
      productType,
      saleId: sale?.id ?? item.sale_id ?? null,
      saleNumber: sale?.sale_number ?? null,
      saleDate: sale?.sale_date ?? null,
      customerId: sale?.customer_id ?? null,
      customerName: sale?.customer_name || "Walk-in",
      salesman: sale?.salesman ?? null,
      paymentMethod: sale?.payment_method ?? null,
    });
  });

  returnItems.forEach((item: any) => {
    const ret = returnById.get(item.return_id);
    const linkedSale =
      (ret?.linked_sale_id && saleById.get(ret.linked_sale_id)) ||
      (ret?.original_sale_number && saleByNumber.get(ret.original_sale_number)) ||
      null;

    const variant = maps.variantMap.get(item.variant_id);
    const productId = item.product_id || variant?.product_id || "";
    const product = productMap.get(productId);
    const productType = product?.product_type || "goods";
    const isService = productType === "service";

    const qty = Number(item.quantity) || 0;
    const lineTotal = Number(item.line_total) || 0;
    if (qty === 0 && lineTotal === 0) return;

    const { cogs, purPrice } = lineCogs(qty, item.variant_id, productType, maps);
    const supplier = resolveSupplier(item.variant_id, productType);

    lines.push({
      qty: -qty,
      grossSales: -lineTotal,
      totalDiscounts: 0,
      netSales: -lineTotal,
      totalCOGS: -cogs,
      zeroCostQty: !isService && purPrice === 0 && qty > 0 ? -qty : 0,
      sign: -1,
      supplierId: supplier.id,
      supplierName: supplier.name,
      productId: productId || item.product_name || "unknown",
      productName:
        item.product_name || product?.product_name || (isService ? "Service" : "Unknown Product"),
      brand: product?.brand ?? null,
      category: product?.category ?? null,
      style: product?.style ?? null,
      size: item.size ?? null,
      color: item.color ?? product?.color ?? null,
      hsn: item.hsn_code ?? product?.hsn_code ?? null,
      productType,
      saleId: linkedSale?.id ?? ret?.linked_sale_id ?? null,
      saleNumber: linkedSale?.sale_number ?? ret?.original_sale_number ?? "Unlinked Return",
      saleDate: linkedSale?.sale_date ?? ret?.return_date ?? null,
      customerId: ret?.customer_id ?? linkedSale?.customer_id ?? null,
      customerName: ret?.customer_name || linkedSale?.customer_name || "Walk-in",
      salesman: linkedSale?.salesman ?? null,
      paymentMethod: ret?.payment_method ?? linkedSale?.payment_method ?? null,
    });
  });

  const totals = sumLines(lines);
  return { lines, totals };
}

function sumLines(lines: ProfitLine[]): ProfitDataset["totals"] {
  const acc = {
    grossSales: 0,
    totalDiscounts: 0,
    netSales: 0,
    totalCOGS: 0,
    itemsSold: 0,
    zeroCostQty: 0,
  };
  for (const line of lines) {
    acc.grossSales += line.grossSales;
    acc.totalDiscounts += line.totalDiscounts;
    acc.netSales += line.netSales;
    acc.totalCOGS += line.totalCOGS;
    acc.itemsSold += line.qty;
    acc.zeroCostQty += line.zeroCostQty;
  }
  const grossProfit = acc.netSales - acc.totalCOGS;
  return {
    ...acc,
    grossProfit,
    marginPercent: acc.netSales !== 0 ? (grossProfit / acc.netSales) * 100 : 0,
  };
}

export function aggregateBy(
  lines: ProfitLine[],
  getGroup: (line: ProfitLine) => { key: string; label: string; secondary?: string | null; tertiary?: string | null },
): ProfitAggregateRow[] {
  const map = new Map<string, ProfitAggregateRow>();

  for (const line of lines) {
    const { key, label, secondary, tertiary } = getGroup(line);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        label,
        secondary: secondary ?? null,
        tertiary: tertiary ?? null,
        grossSales: 0,
        totalDiscounts: 0,
        netSales: 0,
        totalCOGS: 0,
        grossProfit: 0,
        marginPercent: 0,
        itemsSold: 0,
        zeroCostQty: 0,
      };
      map.set(key, row);
    }
    row.grossSales += line.grossSales;
    row.totalDiscounts += line.totalDiscounts;
    row.netSales += line.netSales;
    row.totalCOGS += line.totalCOGS;
    row.itemsSold += line.qty;
    row.zeroCostQty += line.zeroCostQty;
  }

  const result: ProfitAggregateRow[] = [];
  map.forEach((row) => {
    row.grossProfit = row.netSales - row.totalCOGS;
    row.marginPercent = row.netSales !== 0 ? (row.grossProfit / row.netSales) * 100 : 0;
    result.push(row);
  });
  result.sort((a, b) => b.grossProfit - a.grossProfit);
  return result;
}

export function aggregateForTab(
  lines: ProfitLine[],
  tab: NetProfitTab,
  fieldDimension: NetProfitFieldDimension = "brand",
): ProfitAggregateRow[] {
  switch (tab) {
    case "supplier-wise":
      return aggregateBy(lines, (l) => ({
        key: l.supplierId || l.supplierName,
        label: l.supplierName,
      }));
    case "product-wise":
      return aggregateBy(lines, (l) => ({
        key: l.productId || l.productName,
        label: l.productName,
        secondary: l.brand,
        tertiary: l.category,
      }));
    case "bill-wise":
      return aggregateBy(lines, (l) => ({
        key: l.saleId || l.saleNumber || "unknown-bill",
        label: l.saleNumber || BLANK,
        secondary: dayKey(l.saleDate),
        tertiary: l.customerName,
      }));
    case "customer-wise":
      return aggregateBy(lines, (l) => ({
        key: l.customerId || l.customerName || "walk-in",
        label: displayOrBlank(l.customerName),
      }));
    case "salesman-wise":
      return aggregateBy(lines, (l) => ({
        key: (l.salesman || BLANK).trim() || BLANK,
        label: displayOrBlank(l.salesman),
      }));
    case "field-wise":
      return aggregateBy(lines, (l) => {
        const value = fieldValue(l, fieldDimension);
        return { key: `${fieldDimension}:${value}`, label: value };
      });
    default:
      return [];
  }
}

function fieldValue(line: ProfitLine, dim: NetProfitFieldDimension): string {
  switch (dim) {
    case "brand":
      return displayOrBlank(line.brand);
    case "category":
      return displayOrBlank(line.category);
    case "style":
      return displayOrBlank(line.style);
    case "size":
      return displayOrBlank(line.size);
    case "color":
      return displayOrBlank(line.color);
    case "hsn":
      return displayOrBlank(line.hsn);
    case "product_type":
      return displayOrBlank(line.productType);
    case "payment_method":
      return displayOrBlank(line.paymentMethod);
    case "sale_date":
      return dayKey(line.saleDate);
    default:
      return BLANK;
  }
}

export function sumAggregates(rows: ProfitAggregateRow[]): ProfitDataset["totals"] {
  const acc = {
    grossSales: 0,
    totalDiscounts: 0,
    netSales: 0,
    totalCOGS: 0,
    itemsSold: 0,
    zeroCostQty: 0,
  };
  for (const row of rows) {
    acc.grossSales += row.grossSales;
    acc.totalDiscounts += row.totalDiscounts;
    acc.netSales += row.netSales;
    acc.totalCOGS += row.totalCOGS;
    acc.itemsSold += row.itemsSold;
    acc.zeroCostQty += row.zeroCostQty;
  }
  const grossProfit = acc.netSales - acc.totalCOGS;
  return {
    ...acc,
    grossProfit,
    marginPercent: acc.netSales !== 0 ? (grossProfit / acc.netSales) * 100 : 0,
  };
}

export const FIELD_DIMENSION_OPTIONS: {
  value: NetProfitFieldDimension;
  labelKey?: "brand" | "category" | "style" | "color" | "hsn_code";
  fallbackLabel: string;
}[] = [
  { value: "brand", labelKey: "brand", fallbackLabel: "Brand" },
  { value: "category", labelKey: "category", fallbackLabel: "Category" },
  { value: "style", labelKey: "style", fallbackLabel: "Style" },
  { value: "size", fallbackLabel: "Size" },
  { value: "color", labelKey: "color", fallbackLabel: "Color" },
  { value: "hsn", labelKey: "hsn_code", fallbackLabel: "HSN" },
  { value: "product_type", fallbackLabel: "Product Type" },
  { value: "payment_method", fallbackLabel: "Payment Method" },
  { value: "sale_date", fallbackLabel: "Sale Date" },
];
