import { supabase } from "@/integrations/supabase/client";

/** Supplier a sold item came from: the latest live purchase bill that bought it. */
export interface PurchaseSupplier {
  supplier_id: string | null;
  supplier_name: string;
}

export interface SupplierLookup {
  byVariant: Map<string, PurchaseSupplier>;
  byProduct: Map<string, PurchaseSupplier>;
}

export const NO_SUPPLIER_LABEL = "No purchase (opening stock)";

const LOOKUP_BATCH = 150;
const PAGE_SIZE = 1000;
const PARALLEL = 4;

async function latestSupplierBy(
  column: "sku_id" | "product_id",
  ids: string[],
  organizationId: string,
): Promise<Map<string, PurchaseSupplier>> {
  const out = new Map<string, PurchaseSupplier>();
  // Newest first per batch, so the first row seen for an id is its latest purchase.
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) batches.push(ids.slice(i, i + LOOKUP_BATCH));

  const runBatch = async (batch: string[]) => {
    const rows: any[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("purchase_items")
        .select(`${column}, created_at, purchase_bills!inner(supplier_id, supplier_name, organization_id, deleted_at)`)
        .in(column, batch)
        .is("deleted_at", null)
        .eq("purchase_bills.organization_id", organizationId)
        .is("purchase_bills.deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return rows;
  };

  for (let i = 0; i < batches.length; i += PARALLEL) {
    const results = await Promise.all(batches.slice(i, i + PARALLEL).map(runBatch));
    for (const rows of results) {
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      for (const row of rows) {
        const id = row[column];
        const bill = row.purchase_bills;
        if (!id || out.has(id) || !bill?.supplier_name?.trim()) continue;
        out.set(id, { supplier_id: bill.supplier_id ?? null, supplier_name: bill.supplier_name.trim() });
      }
    }
  }
  return out;
}

/**
 * Supplier per sold variant (latest purchase line of that barcode/size); variants never bought on a
 * purchase bill fall back to the latest purchase of any variant of the same product.
 */
export async function fetchSaleItemSuppliers(
  items: Array<{ variant_id?: string | null; product_id?: string | null }>,
  organizationId: string,
): Promise<SupplierLookup> {
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean) as string[])];
  const byVariant = await latestSupplierBy("sku_id", variantIds, organizationId);
  const missingProductIds = [
    ...new Set(
      items
        .filter((i) => !i.variant_id || !byVariant.has(i.variant_id))
        .map((i) => i.product_id)
        .filter(Boolean) as string[],
    ),
  ];
  const byProduct = missingProductIds.length
    ? await latestSupplierBy("product_id", missingProductIds, organizationId)
    : new Map<string, PurchaseSupplier>();
  return { byVariant, byProduct };
}

export function resolveSaleItemSupplier(
  item: { variant_id?: string | null; product_id?: string | null },
  lookup: SupplierLookup | undefined,
): PurchaseSupplier | null {
  if (!lookup) return null;
  return (
    (item.variant_id ? lookup.byVariant.get(item.variant_id) : undefined) ??
    (item.product_id ? lookup.byProduct.get(item.product_id) : undefined) ??
    null
  );
}

export interface SupplierProductRow {
  key: string;
  product_name: string;
  barcode: string;
  brand: string;
  category: string;
  style: string;
  color: string;
  size: string;
  qty: number;
  amount: number;
}

export interface SupplierSalesRow {
  key: string;
  supplier_name: string;
  total_qty: number;
  total_amount: number;
  products: SupplierProductRow[];
}

export interface SupplierSaleLine {
  variant_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  line_total: number | string;
  products?: { brand?: string | null; category?: string | null; style?: string | null; color?: string | null } | null;
}

/**
 * Groups sale lines by supplier, then by product ("product" = one row per product name with its
 * sizes joined; "variant" = one row per barcode/size/colour). Both levels sort by qty sold.
 */
export function buildSupplierWiseSales(
  lines: SupplierSaleLine[],
  lookup: SupplierLookup | undefined,
  level: "product" | "variant",
): SupplierSalesRow[] {
  const suppliers = new Map<string, SupplierSalesRow & { _products: Map<string, SupplierProductRow & { _sizes: Set<string>; _colors: Set<string> }> }>();

  for (const line of lines) {
    const sup = resolveSaleItemSupplier(line, lookup);
    const supplierName = sup?.supplier_name || NO_SUPPLIER_LABEL;
    const supplierKey = sup ? (sup.supplier_id || `name:${supplierName.toUpperCase()}`) : "__none__";
    const qty = Number(line.quantity) || 0;
    const amount = Number(line.line_total) || 0;
    const color = line.color || line.products?.color || "";
    const size = line.size || "";
    const productName = line.product_name || "Unknown";

    let group = suppliers.get(supplierKey);
    if (!group) {
      group = { key: supplierKey, supplier_name: supplierName, total_qty: 0, total_amount: 0, products: [], _products: new Map() };
      suppliers.set(supplierKey, group);
    }
    group.total_qty += qty;
    group.total_amount += amount;

    const productKey =
      level === "product"
        ? line.product_id || productName
        : `${line.barcode || ""}|${line.variant_id || productName}|${size}|${color}`;
    let p = group._products.get(productKey);
    if (!p) {
      p = {
        key: productKey,
        product_name: productName,
        barcode: line.barcode || "",
        brand: line.products?.brand || "",
        category: line.products?.category || "",
        style: line.products?.style || "",
        color,
        size,
        qty: 0,
        amount: 0,
        _sizes: new Set(),
        _colors: new Set(),
      };
      group._products.set(productKey, p);
    }
    p.qty += qty;
    p.amount += amount;
    if (size) p._sizes.add(size);
    if (color) p._colors.add(color);
  }

  return Array.from(suppliers.values())
    .map(({ _products, ...g }) => ({
      ...g,
      products: Array.from(_products.values())
        .map(({ _sizes, _colors, ...p }) =>
          level === "product"
            ? { ...p, barcode: "", size: Array.from(_sizes).join(", "), color: Array.from(_colors).join(", ") }
            : p,
        )
        .sort((a, b) => b.qty - a.qty || b.amount - a.amount),
    }))
    .sort((a, b) => b.total_qty - a.total_qty || b.total_amount - a.total_amount);
}
