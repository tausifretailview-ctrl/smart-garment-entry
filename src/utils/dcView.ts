/**
 * DC view of a list, dashboard or report (see src/lib/dcVisibility.ts):
 *   hideDc  DC left out (Settings > Purchase "Hide DC", or Ctrl+Shift+H)
 *   onlyDc  DC User login: only DC purchases, DC stock, DC sale lines and DC returns
 * Neither set: everything, as before. The filters below leave a query unchanged then.
 */

export type DcViewFlags = { hideDc?: boolean; onlyDc?: boolean };

type Filterable = {
  eq: (column: string, value: unknown) => Filterable;
  not: (column: string, operator: string, value: unknown) => Filterable;
  or: (filters: string) => Filterable;
  is: (column: string, value: null) => Filterable;
};

const asFilterable = <Q>(q: Q) => q as unknown as Filterable;

/** Older callers pass hideDc as a plain boolean. */
export function asDcView(dc: boolean | DcViewFlags | null | undefined): DcViewFlags {
  if (typeof dc === "boolean") return { hideDc: dc };
  return dc ?? {};
}

/** Query-key part for the DC view, so DC-only, DC-hidden and full results never share a cache entry. */
export function dcViewKey(view: DcViewFlags): "dc-only" | "dc-hidden" | null {
  if (view.onlyDc) return "dc-only";
  if (view.hideDc) return "dc-hidden";
  return null;
}

/** Same, as a list to spread into a query key. */
export function dcViewKeyParts(view: DcViewFlags): string[] {
  const k = dcViewKey(view);
  return k ? [k] : [];
}

/** purchase_bills (is_dc_purchase), or another boolean DC column such as purchase_returns.is_dc. */
export function filterPurchasesForDcView<Q>(q: Q, view: DcViewFlags, column = "is_dc_purchase"): Q {
  if (view.onlyDc) return asFilterable(q).eq(column, true) as unknown as Q;
  if (view.hideDc) return asFilterable(q).or(`${column}.is.null,${column}.eq.false`) as unknown as Q;
  return q;
}

/** product_variants (is_dc_product), or an embedded column such as "product_variants.is_dc_product". */
export function filterVariantsForDcView<Q>(q: Q, view: DcViewFlags, column = "is_dc_product"): Q {
  if (view.onlyDc) return asFilterable(q).eq(column, true) as unknown as Q;
  if (view.hideDc) return asFilterable(q).not(column, "is", true) as unknown as Q;
  return q;
}

/** sale_items / sale_return_items (is_dc_item). */
export function filterSaleLinesForDcView<Q>(q: Q, view: DcViewFlags, column = "is_dc_item"): Q {
  if (view.onlyDc) return asFilterable(q).eq(column, true) as unknown as Q;
  if (view.hideDc) return asFilterable(q).not(column, "is", true) as unknown as Q;
  return q;
}

/** Whether a sale / sale return line stays on screen. */
export function saleLineInDcView(line: { is_dc_item?: boolean | null } | null | undefined, view: DcViewFlags): boolean {
  if (view.onlyDc) return line?.is_dc_item === true;
  if (view.hideDc) return line?.is_dc_item !== true;
  return true;
}

/** Whether a product variant stays on screen. */
export function variantInDcView(v: { is_dc_product?: boolean | null } | null | undefined, view: DcViewFlags): boolean {
  if (view.onlyDc) return v?.is_dc_product === true;
  if (view.hideDc) return v?.is_dc_product !== true;
  return true;
}

/** Whether a purchase bill stays on screen. */
export function purchaseInDcView(bill: { is_dc_purchase?: boolean | null } | null | undefined, view: DcViewFlags): boolean {
  if (view.onlyDc) return bill?.is_dc_purchase === true;
  if (view.hideDc) return bill?.is_dc_purchase !== true;
  return true;
}

/**
 * Embedded DC lines for a sales select, so a DC User query returns only bills with a DC line
 * (pair with {@link filterSalesForDcView}). Rows then carry a small dc_lines array. Typed as the
 * select passed in, so the row type stays the same.
 */
export function salesSelectForDcView<S extends string>(select: S, view: DcViewFlags): S {
  return (view.onlyDc ? `${select}, dc_lines:sale_items!inner(id)` : select) as S;
}

/**
 * sales: Hide DC leaves out bills whose every line is DC (is_dc_bill); DC only keeps bills with a
 * DC line (needs {@link salesSelectForDcView} in the select). Mixed bills keep their row either
 * way; totals take their share with saleRowsForDcView (src/utils/dcSaleShare.ts).
 */
export function filterSalesForDcView<Q>(q: Q, view: DcViewFlags): Q {
  if (view.onlyDc) {
    return asFilterable(asFilterable(q).eq("dc_lines.is_dc_item", true)).is("dc_lines.deleted_at", null) as unknown as Q;
  }
  if (view.hideDc) return asFilterable(q).eq("is_dc_bill", false) as unknown as Q;
  return q;
}

/** Embedded DC return lines, so a DC User query returns only returns with a DC line. */
export function saleReturnsSelectForDcView<S extends string>(select: S, view: DcViewFlags): S {
  return (view.onlyDc ? `${select}, dc_lines:sale_return_items!inner(id)` : select) as S;
}

/** sale_returns for a DC User: only returns with a DC line (needs {@link saleReturnsSelectForDcView}). */
export function filterSaleReturnsToDcLines<Q>(q: Q, view: DcViewFlags): Q {
  if (!view.onlyDc) return q;
  return asFilterable(asFilterable(q).eq("dc_lines.is_dc_item", true)).is("dc_lines.deleted_at", null) as unknown as Q;
}
