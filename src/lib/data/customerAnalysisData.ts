import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, fetchInIdBatches, type RangeQuery } from "@/lib/data/fetchInIdBatches";
import type { AnalysisItem, AnalysisProduct, AnalysisReturn, AnalysisSale } from "@/lib/customerAnalysis";

export interface CustomerAnalysisData {
  sales: AnalysisSale[];
  items: AnalysisItem[];
  products: AnalysisProduct[];
  returns: AnalysisReturn[];
}

const SALE_COLUMNS =
  "id, sale_number, sale_date, sale_type, net_amount, paid_amount, payment_method, payment_status, cash_amount, upi_amount, card_amount, finance_amount";
const ITEM_COLUMNS = "id, sale_id, product_id, product_name, size, color, quantity, unit_price, mrp, discount_percent, line_total";

/**
 * Everything the customer analysis reads, for one customer, read-only: their bills (not
 * deleted or cancelled), every line of those bills, the products' brand/category and their
 * sale returns. Id lists go through fetchInIdBatches (URL and 1,000-row caps).
 */
export async function fetchCustomerAnalysisData(organizationId: string, customerId: string): Promise<CustomerAnalysisData> {
  const [sales, returns] = await Promise.all([
    fetchAllRows<AnalysisSale>(
      () =>
        supabase
          .from("sales")
          .select(SALE_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("customer_id", customerId)
          .is("deleted_at", null)
          .or("is_cancelled.is.null,is_cancelled.eq.false")
          .order("id") as unknown as RangeQuery<AnalysisSale>,
    ),
    fetchAllRows<AnalysisReturn>(
      () =>
        supabase
          .from("sale_returns")
          .select("id, return_date, net_amount")
          .eq("organization_id", organizationId)
          .eq("customer_id", customerId)
          .is("deleted_at", null)
          .order("id") as unknown as RangeQuery<AnalysisReturn>,
    ),
  ]);

  const items = await fetchInIdBatches<AnalysisItem>(
    sales.map((s) => s.id),
    (batch) =>
      supabase
        .from("sale_items")
        .select(ITEM_COLUMNS)
        .in("sale_id", batch)
        .is("deleted_at", null)
        .order("id") as unknown as RangeQuery<AnalysisItem>,
  );

  const productIds = [...new Set(items.map((i) => i.product_id).filter((id): id is string => !!id))];
  const products = await fetchInIdBatches<AnalysisProduct>(
    productIds,
    (batch) =>
      supabase
        .from("products")
        .select("id, brand, category")
        .eq("organization_id", organizationId)
        .in("id", batch)
        .order("id") as unknown as RangeQuery<AnalysisProduct>,
  );

  return { sales, items, products, returns };
}
