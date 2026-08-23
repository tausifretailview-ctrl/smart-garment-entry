export const STOREFRONT_LOW_STOCK_THRESHOLD = 5;

export type StorefrontStockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function classifyStorefrontStock(
  qty: number,
  threshold = STOREFRONT_LOW_STOCK_THRESHOLD,
): {
  status: StorefrontStockStatus;
  stockLeft: number | null;
  label: string;
} {
  const n = Number.isFinite(qty) ? Math.floor(qty) : 0;
  if (n <= 0) return { status: "out_of_stock", stockLeft: null, label: "Out of Stock" };
  if (n <= threshold) return { status: "low_stock", stockLeft: n, label: `Only ${n} left` };
  return { status: "in_stock", stockLeft: null, label: "In Stock" };
}

export function storefrontStockLabel(
  status: StorefrontStockStatus,
  stockLeft: number | null,
): string {
  if (status === "out_of_stock") return "Out of Stock";
  if (status === "low_stock" && stockLeft != null && stockLeft > 0) {
    return `Only ${stockLeft} left`;
  }
  return "In Stock";
}

export function formatStorefrontPrice(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}
