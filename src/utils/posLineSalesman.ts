import type { PosCartItem } from "@/lib/posBilling/types";

/** Persisted sale_items.salesman — trim; null when blank. */
export function saleItemSalesmanFromCartLine(
  lineSalesman: string | null | undefined,
): string | null {
  const trimmed = (lineSalesman ?? "").trim();
  return trimmed || null;
}

/** Cart display / new-line default from header picker. */
export function defaultLineSalesmanFromHeader(
  headerSalesman: string | null | undefined,
): string | null {
  return saleItemSalesmanFromCartLine(headerSalesman);
}

export function withDefaultLineSalesman(
  item: PosCartItem,
  headerSalesman: string | null | undefined,
): PosCartItem {
  if ((item.salesman ?? "").trim()) return item;
  const defaultName = defaultLineSalesmanFromHeader(headerSalesman);
  if (!defaultName) return item;
  return { ...item, salesman: defaultName };
}

export function effectiveCartLineSalesman(
  item: Pick<PosCartItem, "salesman">,
  headerSalesman: string | null | undefined,
): string {
  return (item.salesman ?? "").trim() || (headerSalesman ?? "").trim();
}
