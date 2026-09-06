import type { EllaStorefrontProduct } from "./ellaProduct";
import type { EllaSizeOption } from "./ellaVariants";

export type EllaCartLine = {
  /** Unique per product+size, so two sizes of one style are separate lines. */
  key: string;
  productId: string;
  variantId: string | null;
  code: string;
  name: string;
  size: string | null;
  price: number | null;
  priceLabel: string;
  qty: number;
  /** Max units the ERP reports for this size; null when the qty is withheld. */
  maxQty: number | null;
  madeToOrder?: boolean;
  image?: string;
};

export function ellaCartLineKey(productId: string, size: string | null): string {
  return size ? `${productId}::${size}` : productId;
}

export function addToEllaCart(
  cart: EllaCartLine[],
  product: EllaStorefrontProduct,
  size: EllaSizeOption | null,
  qty = 1,
): EllaCartLine[] {
  const sizeLabel = size?.label ?? null;
  const key = ellaCartLineKey(product.productId, sizeLabel);
  const addQty = Math.max(1, Math.floor(qty));
  const maxQty = size && size.availableKnown ? size.available : null;
  const existing = cart.find((line) => line.key === key);

  if (existing) {
    const nextQty = existing.qty + addQty;
    return cart.map((line) =>
      line.key === key
        ? { ...line, qty: maxQty != null ? Math.min(maxQty, nextQty) : nextQty }
        : line,
    );
  }

  return [
    ...cart,
    {
      key,
      productId: product.productId,
      variantId: size?.variantId ?? null,
      code: product.code,
      name: product.name,
      size: sizeLabel,
      price: size?.price ?? product.price,
      priceLabel: product.priceLabel,
      qty: maxQty != null ? Math.min(maxQty, addQty) : addQty,
      maxQty,
      madeToOrder: product.madeToOrder,
      image: product.images[0],
    },
  ];
}

export function updateEllaCartQty(cart: EllaCartLine[], key: string, qty: number): EllaCartLine[] {
  const next = Math.floor(qty);
  if (next <= 0) return cart.filter((line) => line.key !== key);
  return cart.map((line) =>
    line.key === key
      ? { ...line, qty: line.maxQty != null ? Math.min(line.maxQty, next) : next }
      : line,
  );
}

export function removeEllaCartLine(cart: EllaCartLine[], key: string): EllaCartLine[] {
  return cart.filter((line) => line.key !== key);
}

export function ellaCartTotal(cart: EllaCartLine[]): number {
  return cart.reduce((sum, line) => sum + (line.price ?? 0) * line.qty, 0);
}

export function ellaCartCount(cart: EllaCartLine[]): number {
  return cart.reduce((sum, line) => sum + line.qty, 0);
}

export function ellaCartSummaryText(cart: EllaCartLine[]): string {
  return cart
    .map((line) => {
      const size = line.size ? ` · ${line.size}` : "";
      const price = line.priceLabel ? ` — ${line.priceLabel}` : "";
      return `${line.name} (${line.code}${size}) × ${line.qty}${price}`;
    })
    .join("; ");
}
