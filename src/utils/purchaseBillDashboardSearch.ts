import { supabase } from "@/integrations/supabase/client";

/** 4+ digits — same barcode-like gate as purchase bill dashboard date skip. */
export function isPurchaseBarcodeLikeSearch(term: string): boolean {
  return /^\d{4,}$/.test(term.trim());
}

/** Product/brand/style text: contains-match (placeholder says "barcode, product, brand"). */
export function purchaseItemTextSearchOr(searchStr: string): string {
  return (
    `product_name.ilike.%${searchStr}%,` +
    `brand.ilike.%${searchStr}%,` +
    `barcode.ilike.%${searchStr}%,` +
    `style.ilike.%${searchStr}%,` +
    `category.ilike.%${searchStr}%,` +
    `color.ilike.%${searchStr}%`
  );
}

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

  const barcodeLike = isPurchaseBarcodeLikeSearch(t);

  for (const batch of batches) {
    const base = () =>
      supabase
        .from("purchase_items")
        .select("bill_id")
        .is("deleted_at", null)
        .in("bill_id", batch)
        .limit(itemLimit);

    // Numeric 4+ digits: exact barcode, then prefix. Not %barcode% (410 ms class).
    // Product text keeps 6-field contains — dashboard placeholder is substring search.
    const queries = barcodeLike
      ? [base().eq("barcode", t), base().ilike("barcode", `${t}%`)]
      : [base().or(purchaseItemTextSearchOr(t))];

    for (const q of queries) {
      const { data, error } = await q;
      if (error) throw error;
      (data || []).forEach((row) => {
        if (row.bill_id) matched.add(row.bill_id);
      });
      if (barcodeLike && matched.size > 0) break;
    }
    if (matched.size >= itemLimit) break;
  }

  return [...matched];
}

/**
 * Supplier master IDs whose name matches the search term.
 * Used so bill search finds master spellings (e.g. SARASWATI) even when
 * purchase_bills.supplier_name still holds the typo snapshot (SARSWATI).
 */
export async function fetchSupplierIdsMatchingName(
  organizationId: string,
  searchStr: string,
): Promise<string[]> {
  const t = searchStr.trim();
  if (!t) return [];

  const { data, error } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("supplier_name", `%${t}%`);

  if (error) throw error;
  return (data || []).map((r) => r.id).filter(Boolean);
}

/**
 * PostgREST `.or()` filter for bill header text search.
 * Always matches snapshot supplier_name + invoice/bill nos.
 * When `matchingSupplierIds` is provided, also matches those supplier_id values
 * (master-name hits). Callers should pass IDs from fetchSupplierIdsMatchingName.
 */
export function purchaseBillTextSearchFilter(
  searchStr: string,
  matchingSupplierIds?: string[],
): string {
  const t = searchStr.trim();
  const parts = [
    `supplier_name.ilike.%${t}%`,
    `supplier_invoice_no.ilike.%${t}%`,
    `software_bill_no.ilike.%${t}%`,
  ];
  if (matchingSupplierIds && matchingSupplierIds.length > 0) {
    parts.push(`supplier_id.in.(${matchingSupplierIds.join(",")})`);
  }
  return parts.join(",");
}

/** Snapshot + master-name text filter for a tenant (one suppliers lookup). */
export async function purchaseBillTextSearchFilterForOrg(
  organizationId: string,
  searchStr: string,
): Promise<string> {
  const ids = await fetchSupplierIdsMatchingName(organizationId, searchStr);
  return purchaseBillTextSearchFilter(searchStr, ids);
}

/** Display name: master when joined/available, else stored snapshot. Never blank if either exists. */
export function purchaseBillDisplaySupplierName(bill: {
  supplier_name?: string | null;
  suppliers?: { supplier_name?: string | null } | { supplier_name?: string | null }[] | null;
}): string {
  const embed = bill.suppliers;
  const master = Array.isArray(embed) ? embed[0]?.supplier_name : embed?.supplier_name;
  return master ?? bill.supplier_name ?? "";
}
