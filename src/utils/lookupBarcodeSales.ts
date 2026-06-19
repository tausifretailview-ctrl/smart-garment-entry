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

const SALE_ITEM_SELECT = `
  id,
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
  applyFilter: (query: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<any[]> {
  let query = supabase
    .from("sale_items")
    .select(SALE_ITEM_SELECT)
    .is("deleted_at", null)
    .eq("sales.organization_id", organizationId)
    .is("sales.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  query = applyFilter(query) as typeof query;

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Look up sale line history by barcode (exact, partial, or current variant barcode).
 */
export async function lookupBarcodeSales(
  organizationId: string,
  barcode: string,
): Promise<BarcodeSaleRecord[]> {
  const term = barcode.trim();
  if (!term || !organizationId) return [];

  let rows = await fetchSaleItemsForOrg(organizationId, (q) => q.eq("barcode", term));

  if (rows.length === 0) {
    const escaped = escapeIlike(term);
    rows = await fetchSaleItemsForOrg(organizationId, (q) =>
      q.ilike("barcode", `%${escaped}%`),
    );
  }

  if (rows.length === 0) {
    const { data: variants, error: variantErr } = await supabase
      .from("product_variants")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("barcode", term)
      .limit(25);

    if (variantErr) throw variantErr;

    const variantIds = (variants ?? []).map((v) => v.id);
    if (variantIds.length > 0) {
      rows = await fetchSaleItemsForOrg(organizationId, (q) => q.in("variant_id", variantIds));
    }
  }

  const mapped = mapSaleRows(rows);
  mapped.sort(
    (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime(),
  );
  return mapped;
}
