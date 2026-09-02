import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared RPC from the Phase 3 migration. Production does not have it until
 * Lovable applies that SQL — PostgREST then returns PGRST202 / schema cache miss
 * and the Sales dashboard toasts "Sales dashboard load failed".
 * Call the wrappers that already exist on production (and stay as thin
 * wrappers after migrate). Command palette already uses the invoice wrapper.
 */
export const SEARCH_LINE_ITEM_SALE_IDS_RPC = "search_line_item_sale_ids" as const;
export const SEARCH_INVOICE_SALE_IDS_RPC = "search_invoice_sale_ids" as const;
export const SEARCH_POS_SALE_IDS_RPC = "search_pos_sale_ids" as const;

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

/** Invoice-only → search_invoice_sale_ids; otherwise POS wrapper (pos + DC). */
export function lineItemSearchWrapperRpc(
  saleTypes: readonly string[],
): typeof SEARCH_INVOICE_SALE_IDS_RPC | typeof SEARCH_POS_SALE_IDS_RPC {
  if (saleTypes.length === 1 && saleTypes[0] === "invoice") {
    return SEARCH_INVOICE_SALE_IDS_RPC;
  }
  return SEARCH_POS_SALE_IDS_RPC;
}

export async function fetchLineItemMatchingSaleIds(
  client: SupabaseClient,
  args: LineItemSaleSearchArgs,
): Promise<{ saleIds: string[]; meta: LineItemSaleSearchMeta }> {
  const { p_sale_types, ...wrapperArgs } = args;
  const rpcName = lineItemSearchWrapperRpc(p_sale_types);
  const { data, error } = await client.rpc(rpcName, wrapperArgs);
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
