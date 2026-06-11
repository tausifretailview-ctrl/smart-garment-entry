import { supabase } from "@/integrations/supabase/client";

const ITEM_SEARCH_OR = (searchStr: string) =>
  `product_name.ilike.%${searchStr}%,` +
  `brand.ilike.%${searchStr}%,` +
  `barcode.ilike.%${searchStr}%,` +
  `style.ilike.%${searchStr}%,` +
  `category.ilike.%${searchStr}%,` +
  `color.ilike.%${searchStr}%`;

/** Bill IDs in org (+ optional date bounds) — scopes line-item search to tenant + period. */
export async function fetchPurchaseBillIdsInScope(
  organizationId: string,
  options?: { startDate?: string; endDate?: string },
): Promise<string[]> {
  const ids: string[] = [];
  const PAGE = 1000;
  let offset = 0;

  while (true) {
    let q = supabase
      .from("purchase_bills")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (options?.startDate) q = q.gte("bill_date", options.startDate);
    if (options?.endDate) q = q.lte("bill_date", options.endDate);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    ids.push(...data.map((r) => r.id).filter(Boolean));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return ids;
}

/** Line-item search scoped to org bills (avoids org-wide purchase_items scan). */
export async function fetchPurchaseBillIdsMatchingLineItems(
  organizationId: string,
  searchStr: string,
  options?: { startDate?: string; endDate?: string; skipDate?: boolean },
  itemLimit = 300,
): Promise<string[]> {
  const t = searchStr.trim();
  if (!t) return [];

  const billIdsInScope = await fetchPurchaseBillIdsInScope(
    organizationId,
    options?.skipDate ? undefined : { startDate: options?.startDate, endDate: options?.endDate },
  );
  if (billIdsInScope.length === 0) return [];

  const matched = new Set<string>();
  const batches = Array.from(
    { length: Math.ceil(billIdsInScope.length / 200) },
    (_, i) => billIdsInScope.slice(i * 200, i * 200 + 200),
  );

  for (const batch of batches) {
    let q = supabase
      .from("purchase_items")
      .select("bill_id")
      .is("deleted_at", null)
      .in("bill_id", batch)
      .or(ITEM_SEARCH_OR(t))
      .limit(itemLimit);
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach((row) => {
      if (row.bill_id) matched.add(row.bill_id);
    });
    if (matched.size >= itemLimit) break;
  }

  return [...matched];
}

export function purchaseBillTextSearchFilter(searchStr: string): string {
  const t = searchStr.trim();
  return (
    `supplier_name.ilike.%${t}%,` +
    `supplier_invoice_no.ilike.%${t}%,` +
    `software_bill_no.ilike.%${t}%`
  );
}
