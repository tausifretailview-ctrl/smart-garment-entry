import { formatStorefrontPrice } from "@/lib/storefrontStock";
import type { EllaStorefrontProduct } from "./ellaProduct";
import type { EllaSizeOption } from "./ellaVariants";
import { firstPurchasableSize } from "./ellaVariants";

export type EllaCartLine = {
  productId: string;
  variantId: string | null;
  size: string;
  code: string;
  name: string;
  price: number | null;
  priceLabel: string;
  qty: number;
  maxQty: number;
  image?: string;
};

export function ellaCartLineKey(line: Pick<EllaCartLine, "productId" | "variantId">): string {
  return line.variantId ? `${line.productId}:${line.variantId}` : line.productId;
}

function capQty(qty: number, maxQty: number): number {
  return Math.max(1, Math.min(Math.floor(qty), Math.max(1, maxQty)));
}

function resolveSize(product: EllaStorefrontProduct, size?: EllaSizeOption | null): EllaSizeOption | null {
  if (size) return size;
  return firstPurchasableSize(product.sizes);
}

export function addToEllaCart(
  cart: EllaCartLine[],
  product: EllaStorefrontProduct,
  qty = 1,
  size?: EllaSizeOption | null,
): EllaCartLine[] {
  const resolved = resolveSize(product, size);
  const variantId = resolved?.id ?? null;
  const key = ellaCartLineKey({ productId: product.productId, variantId });
  const maxQty = resolved
    ? resolved.availableKnown
      ? Math.max(1, resolved.available)
      : 99
    : product.availableKnown
      ? Math.max(1, product.available)
      : 99;
  const nextQty = capQty(qty, maxQty);
  const existing = cart.find((line) => ellaCartLineKey(line) === key);
  if (existing) {
    return cart.map((line) =>
      ellaCartLineKey(line) === key ? { ...line, qty: capQty(line.qty + nextQty, line.maxQty) } : line,
    );
  }
  return [
    ...cart,
    {
      productId: product.productId,
      variantId,
      size: resolved?.size || "",
      code: product.code,
      name: product.name,
      price: resolved?.price ?? product.price,
      priceLabel: formatStorefrontPrice(resolved?.price ?? product.price) || product.priceLabel,
      qty: nextQty,
      maxQty,
      image: product.images[0],
    },
  ];
}

export function updateEllaCartQty(cart: EllaCartLine[], key: string, qty: number): EllaCartLine[] {
  const next = Math.floor(qty);
  const matches = (line: EllaCartLine) => ellaCartLineKey(line) === key || line.productId === key;
  if (next <= 0) return cart.filter((line) => !matches(line));
  return cart.map((line) => (matches(line) ? { ...line, qty: capQty(next, line.maxQty) } : line));
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
      const size = line.size ? ` ${line.size}` : "";
      const price = line.priceLabel ? ` — ${line.priceLabel}` : "";
      return `${line.name} (${line.code})${size} × ${line.qty}${price}`;
    })
    .join("; ");
}
