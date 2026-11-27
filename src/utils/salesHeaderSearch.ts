import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRpcFunctionError } from "@/utils/fetchAllRows";

/**
 * Bill search by number / customer / phone / salesman, through the database function
 * `search_sales_header_ids`.
 *
 * Why not just `ilike` on the table: a logged-in user reads `sales` through Row Level
 * Security, and there Postgres cannot use the trigram indexes for ILIKE. Every search read
 * all of the shop's bills (about half a second on a big shop). The function checks the shop
 * itself, so the indexes work.
 */
export const SEARCH_SALES_HEADER_IDS_RPC = "search_sales_header_ids" as const;

/** A trigram index needs three characters; shorter text keeps the plain table search. */
export const SALES_HEADER_SEARCH_MIN_CHARS = 3;

/**
 * Most ids the list is filtered by. With more matches the plain table search is used: it
 * stops after the newest page, so it is quick exactly when the text matches many bills.
 */
export const SALES_HEADER_SEARCH_ID_CAP = 150;

/** An id no bill has: "no match" as an id filter. */
export const NO_SALE_ID = "00000000-0000-0000-0000-000000000000";

/** Set once the database answers that the function is not applied yet. */
let headerSearchRpcMissing = false;

/** Test hook: forget a previous "function missing" answer. */
export function resetSalesHeaderSearchProbe(): void {
  headerSearchRpcMissing = false;
}

export type SalesHeaderSearchOptions = {
  organizationId: string;
  search: string;
  saleTypes: readonly string[];
  /** The same bounds the list filters sale_date by (or null for no bound). */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** false = bill number, customer name and phone only. */
  withSalesman?: boolean;
};

/**
 * Ids of ALL bills whose header matches the text, or null when the list must use the plain
 * table search instead: text shorter than three characters, more than
 * {@link SALES_HEADER_SEARCH_ID_CAP} matches, or the function is missing or failed.
 * Never throws: search must keep working on a database without the function.
 */
export async function fetchSalesHeaderMatchIds(
  client: SupabaseClient,
  opts: SalesHeaderSearchOptions,
): Promise<string[] | null> {
  const term = opts.search.trim();
  if (headerSearchRpcMissing || !opts.organizationId || term.length < SALES_HEADER_SEARCH_MIN_CHARS) return null;
  try {
    const { data, error } = await client.rpc(SEARCH_SALES_HEADER_IDS_RPC, {
      p_org_id: opts.organizationId,
      p_search: term,
      p_sale_types: [...opts.saleTypes],
      p_date_from: opts.dateFrom ?? null,
      p_date_to: opts.dateTo ?? null,
      p_limit: SALES_HEADER_SEARCH_ID_CAP + 1,
      p_with_salesman: opts.withSalesman !== false,
    });
    if (error) {
      if (isMissingRpcFunctionError(error)) headerSearchRpcMissing = true;
      return null;
    }
    // The function answers with a list, empty when nothing matches. Anything else is not an answer.
    if (!Array.isArray(data)) return null;
    const ids = [
      ...new Set(
        (data as Array<{ sale_id: string | null }>)
          .map((r) => r?.sale_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    return ids.length > SALES_HEADER_SEARCH_ID_CAP ? null : ids;
  } catch {
    return null;
  }
}

/** PostgREST `or` text that keeps only the given bills (none when the list is empty). */
export function saleIdsOrFilter(ids: readonly string[]): string {
  return `id.in.(${ids.length > 0 ? ids.join(",") : NO_SALE_ID})`;
}
