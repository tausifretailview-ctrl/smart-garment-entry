import { supabase } from "@/integrations/supabase/client";
import { sortSearchResults } from "@/lib/utils";
import {
  buildProductTextOrFilter,
  expandProductSearchTerms,
  matchesProductSearchFields,
  matchesProductTokenBoundary,
  scoreProductSearchMatch,
} from "@/utils/productSearch";
import type { TransferScanVariant } from "@/utils/stockTransfer";

export interface TransferSearchResult extends TransferScanVariant {
  category: string | null;
  style: string | null;
  mrp: number | null;
}

export const TRANSFER_BARCODE_PATTERN = /^[A-Z]{2,4}[0-9]{5,}$|^[0-9]{6,}$/;

/**
 * Stock Transfer product search — same steps as the Sale bill search
 * (SalesInvoice): product name/brand/style/category ILIKE, then variants by
 * barcode / colour / size / matching product, smart sort. Goods with stock only.
 */
export async function searchTransferProducts(orgId: string, raw: string): Promise<TransferSearchResult[]> {
  const query = raw.trim();
  if (query.length < 2) return [];
  const escQuery = query.replace(/[%_,()]/g, "");

  const productOrFilter = buildProductTextOrFilter(expandProductSearchTerms(query));
  const strictIds: string[] = [];
  let productIds: string[] = [];
  if (productOrFilter) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, style, category")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null)
      .or(productOrFilter)
      .limit(250);
    if (error) throw error;
    const rows = data || [];
    for (const p of rows) if (matchesProductTokenBoundary(p, query)) strictIds.push(p.id);
    const loose = rows
      .filter((p) =>
        matchesProductSearchFields(
          { product_name: p.product_name, brand: p.brand || "", style: p.style || "", category: p.category || "" },
          query,
        ),
      )
      .map((p) => p.id);
    productIds = [...new Set([...strictIds, ...loose])];
  }

  const isBarcode = TRANSFER_BARCODE_PATTERN.test(query);
  const byProduct = productIds.length > 0 ? `,product_id.in.(${productIds.join(",")})` : "";
  const orFilter = isBarcode
    ? `barcode.eq.${escQuery},barcode.ilike.${escQuery}%${byProduct}`
    : `barcode.ilike.%${escQuery}%,color.ilike.%${escQuery}%,size.ilike.%${escQuery}%${byProduct}`;

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, size, color, barcode, stock_qty, pur_price, sale_price, mrp, product_id, products (product_name, brand, category, style, product_type, deleted_at)",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .gt("stock_qty", 0)
    .or(orFilter)
    .limit(200);
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data || []) as any[]).filter(
    (v) => v.products && !v.products.deleted_at && !["service", "combo"].includes(v.products.product_type ?? "goods"),
  );

  const rank = new Map([...strictIds, ...productIds].map((id, i) => [id, i]));
  const results = rows
    .sort((a, b) => (rank.get(a.product_id) ?? 9999) - (rank.get(b.product_id) ?? 9999))
    .map((v) => ({
      id: v.id as string,
      barcode: v.barcode as string | null,
      size: v.size as string | null,
      color: v.color as string | null,
      stock_qty: Number(v.stock_qty) || 0,
      pur_price: v.pur_price as number | null,
      sale_price: v.sale_price as number | null,
      mrp: v.mrp as number | null,
      product_name: (v.products?.product_name ?? "") as string,
      brand: (v.products?.brand ?? null) as string | null,
      category: (v.products?.category ?? null) as string | null,
      style: (v.products?.style ?? null) as string | null,
    }));

  const score = (r: TransferSearchResult) =>
    scoreProductSearchMatch(
      {
        product_name: r.product_name,
        brand: r.brand ?? undefined,
        style: r.style ?? undefined,
        category: r.category ?? undefined,
        barcode: r.barcode ?? undefined,
      },
      query,
    );
  return sortSearchResults(results, query, { barcode: "barcode", style: "style", productName: "product_name" }).sort(
    (a, b) => score(b) - score(a),
  );
}
