/**
 * Product Entry opened for a quick fix from another page (e.g. Bulk Product Update)
 * carries `from=<page>` in the URL so Save / Cancel go back there instead of Products.
 */
const RETURN_PAGES = new Set(["bulk-product-update"]);

export function productEntryEditUrl(productId: string, from?: string): string {
  const params = new URLSearchParams({ id: productId });
  if (from && RETURN_PAGES.has(from)) params.set("from", from);
  return `/product-entry?${params.toString()}`;
}

/** Where Product Entry should go after Save / Cancel: the page it came from, else Products. */
export function productEntryReturnPath(search: string): string {
  const from = new URLSearchParams(search).get("from");
  return from && RETURN_PAGES.has(from) ? `/${from}` : "/products";
}
