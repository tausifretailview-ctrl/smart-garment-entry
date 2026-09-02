import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared line-item search RPC (POS dashboard + Sales invoice dashboard). */
export const SEARCH_LINE_ITEM_SALE_IDS_RPC = "search_line_item_sale_ids" as const;

export const POS_LINE_ITEM_SALE_TYPES = ["pos", "delivery_challan"] as const;
export const INVOICE_LINE_ITEM_SALE_TYPES = ["invoice"] as const;

export type LineItemSaleSearchArgs = {
  p_org_id: string;
  p_search: string;
  p_date_from: string | null;
  p_date_to: string | null;
  p_limit: number;
  p_sale_types: string[];
};

/** PostgREST dates are yyyy-MM-dd; dashboard filters may carry full ISO timestamps. */
export function lineItemSearchDateBound(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  return isoOrDate.slice(0, 10);
}

export function buildLineItemSaleSearchArgs(opts: {
  organizationId: string;
  search: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit: number;
  saleTypes: readonly string[];
}): LineItemSaleSearchArgs {
  return {
    p_org_id: opts.organizationId,
    p_search: opts.search,
    p_date_from: lineItemSearchDateBound(opts.dateFrom),
    p_date_to: lineItemSearchDateBound(opts.dateTo),
    p_limit: opts.limit,
    p_sale_types: [...opts.saleTypes],
  };
}

export type LineItemSaleSearchMeta = {
  lineItemCapped: boolean;
  lineItemCap: number;
  lineItemCount: number;
};

export async function fetchLineItemMatchingSaleIds(
  client: SupabaseClient,
  args: LineItemSaleSearchArgs,
): Promise<{ saleIds: string[]; meta: LineItemSaleSearchMeta }> {
  const { data, error } = await client.rpc(SEARCH_LINE_ITEM_SALE_IDS_RPC, args);
  if (error) throw error;
  const saleIds = (data ?? [])
    .map((r: { sale_id: string | null }) => r.sale_id)
    .filter((id: string | null): id is string => Boolean(id));
  return {
    saleIds,
    meta: {
      lineItemCapped: saleIds.length >= args.p_limit,
      lineItemCap: args.p_limit,
      lineItemCount: saleIds.length,
    },
  };
}
