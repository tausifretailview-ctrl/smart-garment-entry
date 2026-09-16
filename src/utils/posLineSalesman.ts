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

/** Omit sale_items.salesman from insert payload unless org uses per-line AND value is set. */
export function saleItemSalesmanInsertField(
  lineSalesman: string | null | undefined,
  perLineEnabled: boolean,
): { salesman?: string } {
  if (!perLineEnabled) return {};
  const value = saleItemSalesmanFromCartLine(lineSalesman);
  if (!value) return {};
  return { salesman: value };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "");
  }
  return String(err ?? "");
}

export function isSaleItemsSalesmanColumnMissingError(err: unknown): boolean {
  const msg = errorMessage(err);
  return (
    msg.includes("salesman") &&
    msg.includes("sale_items") &&
    (msg.includes("schema cache") || msg.includes("PGRST204"))
  );
}

export function effectiveCartLineSalesman(
  item: Pick<PosCartItem, "salesman">,
  headerSalesman: string | null | undefined,
): string {
  return (item.salesman ?? "").trim() || (headerSalesman ?? "").trim();
}
