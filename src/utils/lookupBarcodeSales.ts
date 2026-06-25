import { supabase } from "@/integrations/supabase/client";

export type BarcodeSaleRecord = {
  saleItemId: string;
  saleId: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  productName: string;
  size: string;
  color: string | null;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isCancelled: boolean;
};

function escapeIlike(term: string) {
  return term.replace(/[%_\\]/g, "\\$&");
}

/** Barcode / scanner input — skip for plain text like "FANCY" to avoid wasted round-trips. */
function looksLikeBarcode(term: string): boolean {
  const t = term.trim();
  return t.length >= 4 && /\d/.test(t) && /^[a-zA-Z0-9-]+$/.test(t);
}

/** Same AND logic as Quick Stock — split on spaces and hyphens. */
function matchesProductSearch(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  const tokens = query.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.map((f) => (f != null ? String(f) : "")).join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

const SALE_ITEM_SELECT = `
  id,
  product_id,
  product_name,
  size,
  color,
  barcode,
  quantity,
  unit_price,
  line_total,
  variant_id,
  sales!inner(
    id,
    sale_number,
    sale_date,
    customer_name,
    organization_id,
    is_cancelled,
    deleted_at
  )
`;

const MAX_SALE_LOOKUP_RESULTS = 100;

function mapSaleRows(rows: any[]): BarcodeSaleRecord[] {
  return rows
    .filter((row) => {
      const sale = row.sales;
      return sale && !sale.deleted_at;
    })
    .map((row) => {
      const sale = row.sales;
      return {
        saleItemId: row.id,
        saleId: sale.id,
        saleNumber: sale.sale_number || "—",
        saleDate: sale.sale_date,
        customerName: sale.customer_name || "Walk-in",
        productName: row.product_name || "—",
        size: row.size || "—",
        color: row.color ?? null,
        barcode: row.barcode ?? null,
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unit_price) || 0,
        lineTotal: Number(row.line_total) || 0,
        isCancelled: !!sale.is_cancelled,
      };
    });
}

async function fetchSaleItemsForOrg(
  organizationId: string,
  applyFilter: (query: any) => any,
  limit = MAX_SALE_LOOKUP_RESULTS,
): Promise<any[]> {
  let query = supabase
    .from("sale_items")
    .select(SALE_ITEM_SELECT)
    .is("deleted_at", null)
    .eq("sales.organization_id", organizationId)
    .is("sales.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  query = applyFilter(query);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function mergeSaleItemRows(existing: any[], incoming: any[]): any[] {
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of incoming) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

async function fetchProductMeta(
  organizationId: string,
  productIds: string[],
): Promise<Record<string, { brand: string; category: string }>> {
  if (productIds.length === 0) return {};
  const unique = [...new Set(productIds)];
  const { data, error } = await supabase
    .from("products")
    .select("id, brand, category")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("id", unique.slice(0, 100));
  if (error) throw error;
  const map: Record<string, { brand: string; category: string }> = {};
  (data ?? []).forEach((row) => {
    map[row.id] = {
      brand: row.brand || "",
      category: row.category || "",
    };
  });
  return map;
}

function filterSaleRowsByQuery(
  rows: any[],
  query: string,
  productMeta: Record<string, { brand: string; category: string }>,
): BarcodeSaleRecord[] {
  const mapped = mapSaleRows(rows).filter((row) => {
    const raw = rows.find((r) => r.id === row.saleItemId);
    const meta = raw?.product_id ? productMeta[raw.product_id] : undefined;
    return matchesProductSearch(
      query,
      row.productName,
      row.barcode,
      row.size,
      row.color,
      meta?.brand,
      meta?.category,
      row.saleNumber,
      row.customerName,
    );
  });
  mapped.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  return mapped.slice(0, MAX_SALE_LOOKUP_RESULTS);
}

async function lookupExactBarcodeSales(
  organizationId: string,
  barcode: string,
): Promise<BarcodeSaleRecord[]> {
  const [exactRows, fuzzyRows] = await Promise.all([
    fetchSaleItemsForOrg(organizationId, (q) => q.eq("barcode", barcode)),
    fetchSaleItemsForOrg(organizationId, (q) => {
      const escaped = escapeIlike(barcode);
      return q.ilike("barcode", `${escaped}%`);
    }),
  ]);

  let rows = mergeSaleItemRows(exactRows, fuzzyRows);

  if (rows.length === 0) {
    const { data: variants, error: variantErr } = await supabase
      .from("product_variants")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("barcode", barcode)
      .limit(25);

    if (variantErr) throw variantErr;

    const variantIds = (variants ?? []).map((v) => v.id);
    if (variantIds.length > 0) {
      rows = await fetchSaleItemsForOrg(organizationId, (q) => q.in("variant_id", variantIds));
    }
  }

  const mapped = mapSaleRows(rows);
  mapped.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  return mapped.slice(0, MAX_SALE_LOOKUP_RESULTS);
}

async function lookupProductDetailSales(
  organizationId: string,
  query: string,
): Promise<BarcodeSaleRecord[]> {
  const term = query.trim();
  const escapedFull = escapeIlike(term);

  // Wave 1 — resolve products/variants and a direct line-item probe in parallel.
  const [productsRes, variantsRes, directSaleItems] = await Promise.all([
    supabase
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(
        `product_name.ilike.%${escapedFull}%,brand.ilike.%${escapedFull}%,category.ilike.%${escapedFull}%`,
      )
      .limit(50),
    supabase
      .from("product_variants")
      .select("id, product_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`barcode.ilike.%${escapedFull}%,size.ilike.%${escapedFull}%,color.ilike.%${escapedFull}%`)
      .limit(100),
    fetchSaleItemsForOrg(
      organizationId,
      (q) =>
        q.or(
          `product_name.ilike.%${escapedFull}%,barcode.ilike.%${escapedFull}%,size.ilike.%${escapedFull}%,color.ilike.%${escapedFull}%`,
        ),
      200,
    ),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (variantsRes.error) throw variantsRes.error;

  const productIds = [
    ...new Set([
      ...(productsRes.data ?? []).map((p) => p.id),
      ...(variantsRes.data ?? [])
        .map((v) => v.product_id)
        .filter((id): id is string => !!id),
    ]),
  ];
  const variantIds = (variantsRes.data ?? []).map((v) => v.id);

  // Wave 2 — fetch sale lines for matched products/variants in parallel (no per-token DB loop).
  const wave2: Promise<any[]>[] = [];
  if (productIds.length > 0) {
    wave2.push(
      fetchSaleItemsForOrg(
        organizationId,
        (q) => q.in("product_id", productIds.slice(0, 50)),
        250,
      ),
    );
  }
  if (variantIds.length > 0) {
    wave2.push(
      fetchSaleItemsForOrg(
        organizationId,
        (q) => q.in("variant_id", variantIds.slice(0, 100)),
        250,
      ),
    );
  }

  let rows = directSaleItems;
  if (wave2.length > 0) {
    const batches = await Promise.all(wave2);
    for (const batch of batches) {
      rows = mergeSaleItemRows(rows, batch);
    }
  }

  const allProductIds = [
    ...new Set(rows.map((row) => row.product_id).filter(Boolean) as string[]),
  ];
  const productMeta = await fetchProductMeta(organizationId, allProductIds);
  return filterSaleRowsByQuery(rows, term, productMeta);
}

/**
 * Look up sale line history by barcode (exact) or product details (multi-word AND).
 */
export async function lookupBarcodeSales(
  organizationId: string,
  searchQuery: string,
): Promise<BarcodeSaleRecord[]> {
  const term = searchQuery.trim();
  if (!term || !organizationId) return [];

  if (looksLikeBarcode(term)) {
    const exact = await lookupExactBarcodeSales(organizationId, term);
    if (exact.length > 0) return exact;
  }

  return lookupProductDetailSales(organizationId, term);
}
