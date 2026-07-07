import { supabase } from "@/integrations/supabase/client";
import {
  buildProductTextOrFilter,
  buildProductTokenBoundaryOrFilter,
  compactProductToken,
  expandProductSearchTerms,
  leadingProductToken,
  matchesCompactProductSearch,
  matchesProductSearchFields,
  scoreProductSearchMatch,
} from "@/utils/productSearch";

export const VARIANT_SEARCH_SELECT = `
  id, size, pur_price, sale_price, mrp, barcode, color, stock_qty, product_id,
  products (id, product_name, brand, category, style, color, hsn_code, gst_per, uom, size_group_id)
`;

export type SaleOrderVariantSearchResult = {
  id: string;
  product_id: string;
  size: string;
  sale_price: number;
  mrp: number;
  barcode: string;
  stock_qty: number;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  gst_per: number;
  hsn_code: string;
  uom?: string;
  size_range?: string | null;
};

export type SaleOrderProductSearchGroup = {
  productName: string;
  brand: string;
  category: string;
  style: string;
  gst_per: number;
  hsn_code: string;
  uom?: string;
  productIds: string[];
  representative: SaleOrderVariantSearchResult;
  variants: SaleOrderVariantSearchResult[];
  totalStock: number;
  sizeCount: number;
  colorCount: number;
  colors: string[];
  size_range?: string | null;
};

export function buildSaleOrderProductGroupKey(
  v: Pick<SaleOrderVariantSearchResult, "product_name" | "brand" | "category" | "style">,
  searchTerm?: string,
): string {
  const term = searchTerm?.trim().toLowerCase();
  if (term && term.length >= 2) {
    if (matchesProductSearchFields(v, term)) {
      const lead = leadingProductToken(v.product_name);
      return `search:${compactProductToken(lead || v.product_name)}||${(v.brand || "").trim().toLowerCase()}`;
    }
  }
  const brand = (v.brand || "").trim().toLowerCase();
  const style = (v.style || "").trim().toLowerCase();
  const category = (v.category || "").trim().toLowerCase();
  if (style) return `family:${brand}||${style}||${category}`;
  const name = (v.product_name || "").trim().toLowerCase();
  return `name:${name}||${brand}||${category}`;
}

function sizeRangeFromGroup(sizes: string[] | undefined | null): string | null {
  if (!sizes?.length) return null;
  return sizes.length > 1 ? `${sizes[0]}-${sizes[sizes.length - 1]}` : sizes[0];
}

function mapVariantSearchRow(v: any): SaleOrderVariantSearchResult {
  return {
    id: v.id,
    product_id: v.products?.id || v.product_id || "",
    size: v.size,
    sale_price: v.sale_price,
    mrp: v.mrp || 0,
    barcode: v.barcode || "",
    stock_qty: v.stock_qty || 0,
    product_name: v.products?.product_name || "",
    brand: v.products?.brand || "",
    category: v.products?.category || "",
    color: v.color || v.products?.color || "",
    style: v.products?.style || "",
    gst_per: v.products?.gst_per || 0,
    hsn_code: v.products?.hsn_code || "",
    uom: v.products?.uom,
  };
}

function attachSizeRangesToResults(
  rows: any[],
  sizeGroupsMap: Record<string, { sizes: string[] }>,
): SaleOrderVariantSearchResult[] {
  return rows.map((v) => {
    const mapped = mapVariantSearchRow(v);
    const sizeGroupId = v.products?.size_group_id as string | undefined;
    const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
    return {
      ...mapped,
      size_range: sizeRangeFromGroup(sizeGroup?.sizes),
    };
  });
}

export function groupVariantsByProductFamily(
  results: SaleOrderVariantSearchResult[],
  searchTerm?: string,
): SaleOrderProductSearchGroup[] {
  const productMap = new Map<
    string,
    {
      productIds: Set<string>;
      variants: SaleOrderVariantSearchResult[];
      colors: Set<string>;
      totalStockFromSample: number;
    }
  >();

  for (const r of results) {
    const groupKey = buildSaleOrderProductGroupKey(r, searchTerm);
    if (!groupKey) continue;
    if (!productMap.has(groupKey)) {
      productMap.set(groupKey, {
        productIds: new Set([r.product_id]),
        variants: [r],
        colors: new Set(r.color ? [r.color] : []),
        totalStockFromSample: r.stock_qty || 0,
      });
      continue;
    }
    const group = productMap.get(groupKey)!;
    group.productIds.add(r.product_id);
    if (r.color) group.colors.add(r.color);
    if (!group.variants.some((v) => v.id === r.id)) {
      group.variants.push(r);
      group.totalStockFromSample += r.stock_qty || 0;
    }
  }

  return Array.from(productMap.values()).map((group) => {
    const representative = group.variants.reduce(
      (best, v) => ((v.stock_qty || 0) > (best.stock_qty || 0) ? v : best),
      group.variants[0],
    );
    const uniqueSizes = new Set(group.variants.map((v) => v.size).filter(Boolean));
    return {
      productName: representative.product_name,
      brand: representative.brand,
      category: representative.category,
      style: representative.style,
      gst_per: representative.gst_per,
      hsn_code: representative.hsn_code,
      uom: representative.uom,
      productIds: Array.from(group.productIds),
      representative,
      variants: group.variants,
      totalStock: group.totalStockFromSample,
      sizeCount: uniqueSizes.size || group.variants.length,
      colorCount: group.colors.size,
      colors: Array.from(group.colors),
      size_range: representative.size_range,
    };
  });
}

async function sumVariantStockForProducts(orgId: string, productIds: string[]): Promise<number> {
  if (!productIds.length) return 0;
  const { data, error } = await supabase
    .from("product_variants")
    .select("stock_qty")
    .eq("organization_id", orgId)
    .eq("active", true)
    .is("deleted_at", null)
    .in("product_id", productIds);
  if (error) {
    console.error("sumVariantStockForProducts failed", error);
    return 0;
  }
  return (data || []).reduce((sum, row) => sum + Number(row.stock_qty || 0), 0);
}

export async function enrichSaleOrderSearchGroups(
  orgId: string,
  groups: SaleOrderProductSearchGroup[],
  rawQuery: string,
): Promise<SaleOrderProductSearchGroup[]> {
  const expandedTerms = expandProductSearchTerms(rawQuery);
  const primaryTerm = expandedTerms[0] || rawQuery.trim().toLowerCase();
  if (!primaryTerm || groups.length === 0) return groups;

  const productOrFilter = buildProductTextOrFilter(expandedTerms);
  const { data: matchingProducts } = productOrFilter
    ? await supabase
        .from("products")
        .select("id, product_name, brand, category, style, color")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .is("deleted_at", null)
        .or(productOrFilter)
    : { data: [] as { id: string; product_name: string; brand: string | null; category: string | null; style: string | null; color: string | null }[] };

  return Promise.all(
    groups.map(async (group) => {
      const key = buildSaleOrderProductGroupKey(group.representative, rawQuery);
      const mergedIds = new Set(group.productIds);
      for (const p of matchingProducts || []) {
        if (
          buildSaleOrderProductGroupKey(
            {
              product_name: p.product_name,
              brand: p.brand || "",
              category: p.category || "",
              style: p.style || "",
            },
            rawQuery,
          ) === key
        ) {
          mergedIds.add(p.id);
        }
      }
      const productIds = Array.from(mergedIds);
      const totalStock = await sumVariantStockForProducts(orgId, productIds);

      const colors = new Set(group.colors);
      for (const p of matchingProducts || []) {
        if (mergedIds.has(p.id) && p.color) colors.add(p.color);
      }

      return {
        ...group,
        productIds,
        totalStock,
        colorCount: colors.size,
        colors: Array.from(colors),
      };
    }),
  );
}

/** Server-side variant search — barcode, compact token, size-group aware. */
export async function searchSaleOrderVariants(
  orgId: string,
  rawQuery: string,
): Promise<SaleOrderVariantSearchResult[]> {
  const normalized = rawQuery.trim().toLowerCase().replace(/[%_(),."']/g, "");
  if (!normalized) return [];

  const expandedTerms = expandProductSearchTerms(rawQuery);
  const searchTerms = normalized.split(/\s+/).filter(Boolean);
  const compactQuery = compactProductToken(rawQuery);

  let productIds: string[] = [];
  const strictProductIds: string[] = [];
  const tokenBoundaryFilter = buildProductTokenBoundaryOrFilter(rawQuery);
  if (tokenBoundaryFilter) {
    const { data: boundaryProducts } = await supabase
      .from("products")
      .select("id, product_name, brand, style, category")
      .is("deleted_at", null)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .or(tokenBoundaryFilter)
      .limit(80);
    strictProductIds.push(...(boundaryProducts?.map((p) => p.id) || []));
  }

  const productOrFilter = buildProductTextOrFilter(expandedTerms);
  if (productOrFilter) {
    const { data: matchingProducts } = await supabase
      .from("products")
      .select("id, product_name, brand, style, category")
      .is("deleted_at", null)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .or(productOrFilter)
      .limit(250);
    const broadIds = (matchingProducts || [])
      .filter((p) =>
        matchesProductSearchFields(
          {
            product_name: p.product_name,
            brand: p.brand || "",
            style: p.style || "",
            category: p.category || "",
          },
          rawQuery,
        ),
      )
      .map((p) => p.id);
    productIds = [...new Set([...strictProductIds, ...broadIds])];
  } else {
    productIds = [...new Set(strictProductIds)];
  }

  if (productIds.length === 0 && compactQuery.length >= 3) {
    const prefix = compactQuery.match(/^([a-z]+)\d/i)?.[1];
    if (prefix && prefix.length >= 2) {
      const { data: prefixProducts } = await supabase
        .from("products")
        .select("id, product_name, brand, style, category")
        .is("deleted_at", null)
        .eq("organization_id", orgId)
        .eq("status", "active")
        .ilike("product_name", `${prefix}%`)
        .limit(250);
      productIds = (prefixProducts || [])
        .filter((p) =>
          matchesCompactProductSearch(
            {
              product_name: p.product_name,
              brand: p.brand || "",
              style: p.style || "",
              category: p.category || "",
            },
            rawQuery,
          ),
        )
        .map((p) => p.id);
    }
  }

  const barcodeOrTerms = expandedTerms
    .map((term) => {
      const safe = term.replace(/[%_]/g, "");
      if (!safe) return [];
      return [`barcode.ilike.%${safe}%`, `color.ilike.%${safe}%`];
    })
    .flat()
    .join(",");

  const { data: barcodeVariants } = barcodeOrTerms
    ? await supabase
        .from("product_variants")
        .select(VARIANT_SEARCH_SELECT)
        .eq("active", true)
        .is("deleted_at", null)
        .eq("organization_id", orgId)
        .or(barcodeOrTerms)
        .limit(50)
    : { data: [] as any[] };

  let productVariants: any[] = [];
  if (productIds.length > 0) {
    const orderedIds = [
      ...strictProductIds,
      ...productIds.filter((id) => !strictProductIds.includes(id)),
    ];
    const chunkSize = 40;
    for (let i = 0; i < orderedIds.length && productVariants.length < 200; i += chunkSize) {
      const chunk = orderedIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("product_variants")
        .select(VARIANT_SEARCH_SELECT)
        .eq("active", true)
        .is("deleted_at", null)
        .eq("organization_id", orgId)
        .in("product_id", chunk)
        .limit(120);
      productVariants.push(...(data || []));
    }
  }

  if (productIds.length === 0) {
    const fuzzyOr = expandedTerms
      .map((term) => {
        const safe = term.replace(/[%_]/g, "");
        if (!safe) return [];
        return [`color.ilike.%${safe}%`, `size.ilike.%${safe}%`];
      })
      .flat()
      .join(",");
    if (fuzzyOr) {
      const { data: fuzzyVariants } = await supabase
        .from("product_variants")
        .select(VARIANT_SEARCH_SELECT)
        .eq("active", true)
        .is("deleted_at", null)
        .eq("organization_id", orgId)
        .or(fuzzyOr)
        .limit(50);
      productVariants = fuzzyVariants || [];
    }
  }

  const uniqueMap = new Map<string, any>();
  [...(barcodeVariants || []), ...productVariants].forEach((v) => uniqueMap.set(v.id, v));

  const mergedRows = Array.from(uniqueMap.values());
  const sizeGroupIds = [
    ...new Set(mergedRows.map((v) => v.products?.size_group_id).filter(Boolean)),
  ] as string[];

  let sizeGroupsMap: Record<string, { sizes: string[] }> = {};
  if (sizeGroupIds.length > 0) {
    const { data: sizeGroups } = await supabase
      .from("size_groups")
      .select("id, sizes")
      .in("id", sizeGroupIds);
    sizeGroups?.forEach((sg: { id: string; sizes: string[] | null }) => {
      sizeGroupsMap[sg.id] = { sizes: sg.sizes || [] };
    });
  }

  let results = attachSizeRangesToResults(mergedRows, sizeGroupsMap);

  if (searchTerms.length > 1) {
    results = results.filter((r) =>
      matchesProductSearchFields(
        {
          product_name: r.product_name,
          brand: r.brand,
          style: r.style,
          category: r.category,
          barcode: r.barcode,
          color: r.color,
          size: r.size,
        },
        rawQuery,
      ),
    );
  } else if (compactQuery.length >= 2) {
    const compactMatches = results.filter((r) =>
      matchesCompactProductSearch(
        {
          product_name: r.product_name,
          brand: r.brand,
          style: r.style,
          category: r.category,
          barcode: r.barcode,
          color: r.color,
          size: r.size,
        },
        rawQuery,
      ),
    );
    if (compactMatches.length > 0) {
      const compactIds = new Set(compactMatches.map((r) => r.id));
      const rest = results.filter((r) => !compactIds.has(r.id));
      results = [...compactMatches, ...rest];
    }
  }

  return [...results].sort((a, b) => {
    const scoreA = scoreProductSearchMatch(
      { product_name: a.product_name, brand: a.brand, style: a.style, category: a.category, barcode: a.barcode },
      rawQuery,
    );
    const scoreB = scoreProductSearchMatch(
      { product_name: b.product_name, brand: b.brand, style: b.style, category: b.category, barcode: b.barcode },
      rawQuery,
    );
    return scoreB - scoreA;
  });
}
