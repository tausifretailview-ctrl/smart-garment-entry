import type { SupabaseClient } from "@supabase/supabase-js";
import { isSaleInvoiceCancelled } from "@/utils/saleInvoiceStatus";
import {
  resolveSaleReturnUnitPrice,
  type SaleItemPriceFields,
  type SaleReturnPriceOptions,
} from "@/utils/saleReturnPricing";

export const CUSTOMER_LAST_SALE_ITEM_SELECT =
  "unit_price, per_qty_net_amount, line_total, quantity, net_after_discount, discount_percent, created_at, " +
  "sales!inner(customer_id, organization_id, flat_discount_amount, round_off, is_cancelled, payment_status, deleted_at)";

type JoinedSale = {
  flat_discount_amount?: number | null;
  round_off?: number | null;
  is_cancelled?: boolean | null;
  payment_status?: string | null;
};

type CustomerSaleItemRow = SaleItemPriceFields & {
  sales?: JoinedSale | JoinedSale[] | null;
};

export type CustomerLastSaleItem = {
  item: SaleItemPriceFields;
  billFlatDiscount: number;
  billRoundOff: number;
};

const firstSale = (sales: CustomerSaleItemRow["sales"]): JoinedSale | null =>
  Array.isArray(sales) ? (sales[0] ?? null) : (sales ?? null);

/**
 * Most recent non-cancelled sale line of `variantId` that was sold to `customerId`.
 * Used to price a sale return when no original bill number is typed: the customer's own
 * purchase carries the discount they actually got, unlike another customer's bill or the
 * variant's list price.
 */
export async function fetchCustomerLastSaleItem(
  client: Pick<SupabaseClient, "from">,
  args: { organizationId: string; customerId: string; variantId: string },
): Promise<CustomerLastSaleItem | null> {
  const { data, error } = await client
    .from("sale_items")
    .select(CUSTOMER_LAST_SALE_ITEM_SELECT)
    .eq("variant_id", args.variantId)
    .is("deleted_at", null)
    .eq("sales.organization_id", args.organizationId)
    .eq("sales.customer_id", args.customerId)
    .is("sales.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !data) return null;

  for (const row of data as unknown as CustomerSaleItemRow[]) {
    const sale = firstSale(row.sales);
    if (isSaleInvoiceCancelled(sale)) continue;
    return {
      item: row,
      billFlatDiscount: Number(sale?.flat_discount_amount) || 0,
      billRoundOff: Number(sale?.round_off) || 0,
    };
  }
  return null;
}

/** Unit price from the customer's last purchase of the variant, or null when there is none. */
export async function resolveCustomerLastSaleReturnPrice(
  client: Pick<SupabaseClient, "from">,
  args: { organizationId: string; customerId: string; variantId: string },
  opts: Pick<SaleReturnPriceOptions, "useOriginalPrice">,
): Promise<number | null> {
  const hit = await fetchCustomerLastSaleItem(client, args);
  if (!hit) return null;
  const price = resolveSaleReturnUnitPrice(hit.item, {
    useOriginalPrice: opts.useOriginalPrice,
    billFlatDiscount: hit.billFlatDiscount,
    billRoundOff: hit.billRoundOff,
  });
  return price > 0 ? price : null;
}
