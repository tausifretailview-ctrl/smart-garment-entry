import type { EllaStorefrontProduct } from "./ellaProduct";

export type EllaCartLine = {
  productId: string;
  code: string;
  name: string;
  price: number | null;
  priceLabel: string;
  qty: number;
  image?: string;
};

export function ellaCartLineKey(productId: string): string {
  return productId;
}

export function addToEllaCart(cart: EllaCartLine[], product: EllaStorefrontProduct, qty = 1): EllaCartLine[] {
  const key = ellaCartLineKey(product.productId);
  const nextQty = Math.max(1, Math.floor(qty));
  const existing = cart.find((line) => line.productId === key);
  if (existing) {
    return cart.map((line) =>
      line.productId === key ? { ...line, qty: line.qty + nextQty } : line,
    );
  }
  return [
    ...cart,
    {
      productId: key,
      code: product.code,
      name: product.name,
      price: product.price,
      priceLabel: product.priceLabel,
      qty: nextQty,
      image: product.images[0],
    },
  ];
}

export function updateEllaCartQty(cart: EllaCartLine[], productId: string, qty: number): EllaCartLine[] {
  const next = Math.floor(qty);
  if (next <= 0) return cart.filter((line) => line.productId !== productId);
  return cart.map((line) => (line.productId === productId ? { ...line, qty: next } : line));
}

export function ellaCartTotal(cart: EllaCartLine[]): number {
  return cart.reduce((sum, line) => sum + (line.price ?? 0) * line.qty, 0);
}

export function ellaCartCount(cart: EllaCartLine[]): number {
  return cart.reduce((sum, line) => sum + line.qty, 0);
}

export function ellaCartSummaryText(cart: EllaCartLine[]): string {
  return cart
    .map((line) => `${line.name} (${line.code}) × ${line.qty}${line.priceLabel ? ` — ${line.priceLabel}` : ""}`)
    .join("; ");
}
