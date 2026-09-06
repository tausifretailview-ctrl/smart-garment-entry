import { useEffect, useMemo, useState } from "react";
import { ellaMaxPurchaseQty, ellaStockBadgeClass } from "./ellaStock";
import type { EllaStorefrontProduct } from "./ellaProduct";
import { addToEllaCart, ellaCartLineKey, type EllaCartLine } from "./ellaCart";
import { firstPurchasableSize, type EllaSizeOption } from "./ellaVariants";
import { useLockBodyScroll } from "./ellaLockBody";
import { formatStorefrontPrice } from "@/lib/storefrontStock";

export function EllaProductSheet({
  product,
  cart,
  onAddToCart,
  onOpenCart,
  onClose,
}: {
  product: EllaStorefrontProduct;
  cart: EllaCartLine[];
  onAddToCart: (next: EllaCartLine[]) => void;
  onOpenCart: () => void;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  const [photo, setPhoto] = useState(0);
  const [sizeId, setSizeId] = useState(() => firstPurchasableSize(product.sizes)?.id || product.sizes[0]?.id || "");
  const selectedSize: EllaSizeOption | null =
    product.sizes.find((size) => size.id === sizeId) || firstPurchasableSize(product.sizes);

  const stock = selectedSize?.stock ?? product.stock;
  const availableKnown = selectedSize?.availableKnown ?? product.availableKnown;
  const rawMax = selectedSize
    ? selectedSize.availableKnown
      ? Math.max(0, selectedSize.available)
      : ellaMaxPurchaseQty(stock, availableKnown)
    : ellaMaxPurchaseQty(product.stock, product.availableKnown);
  const inCart = useMemo(() => {
    const key = ellaCartLineKey({
      productId: product.productId,
      variantId: selectedSize?.id ?? null,
    });
    return cart.find((line) => ellaCartLineKey(line) === key)?.qty ?? 0;
  }, [cart, product.productId, selectedSize?.id]);
  const maxQty = Math.max(0, rawMax - inCart);
  const [qty, setQty] = useState(1);
  const priceLabel = formatStorefrontPrice(selectedSize?.price ?? product.price) || product.priceLabel;
  const images = product.images.length > 0 ? product.images : [];

  useEffect(() => {
    setPhoto(0);
    setSizeId(firstPurchasableSize(product.sizes)?.id || product.sizes[0]?.id || "");
  }, [product.productId, product.sizes]);

  useEffect(() => {
    setQty((current) => Math.min(Math.max(1, current), Math.max(1, maxQty)));
  }, [maxQty, sizeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = () => {
    if (maxQty <= 0) return;
    onAddToCart(addToEllaCart(cart, product, qty, selectedSize));
    onOpenCart();
  };

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close product" onClick={onClose} />
      <section className="ella-sheet" role="dialog" aria-modal="true" aria-labelledby="ella-product-title">
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">{product.category}</div>
              <h2 id="ella-product-title" className="ella-display ella-sheet-name">
                {product.name}
              </h2>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {images[photo] ? (
            <div className="ella-sheet-img">
              <img src={images[photo]} alt={product.name} decoding="async" />
            </div>
          ) : null}

          {images.length > 1 ? (
            <div className="ella-gallery" role="tablist" aria-label="Product photos">
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  className={`ella-gallery-thumb${photo === index ? " ella-gallery-thumb-active" : ""}`}
                  onClick={() => setPhoto(index)}
                  aria-label={`Photo ${index + 1}`}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="ella-price-row">
            {priceLabel ? <div className="ella-price">{priceLabel}</div> : null}
            <span className={ellaStockBadgeClass(stock.state)} style={{ position: "static" }}>
              {stock.label}
            </span>
          </div>

          {product.sizes.length > 0 ? (
            <div className="ella-size-picker">
              <span className="ella-eyebrow">Size</span>
              <div className="ella-size-chips" role="group" aria-label="Sizes">
                {product.sizes.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    className={`ella-size-chip${sizeId === size.id ? " ella-size-chip-active" : ""}${
                      size.purchasable ? "" : " ella-size-chip-sold"
                    }`}
                    disabled={!size.purchasable}
                    onClick={() => setSizeId(size.id)}
                  >
                    {size.size}
                  </button>
                ))}
              </div>
              <p className="ella-size-stock">{stock.label}</p>
            </div>
          ) : null}

          <dl className="ella-spec">
            <div className="ella-spec-row">
              <dt>Style</dt>
              <dd>{product.code}</dd>
            </div>
            <div className="ella-spec-row">
              <dt>Fabric</dt>
              <dd>{product.fabric}</dd>
            </div>
            <div className="ella-spec-row">
              <dt>Availability</dt>
              <dd>{stock.label}</dd>
            </div>
          </dl>

          <p className="ella-form-note">On-hand for this size is confirmed at checkout from live ERP stock.</p>

          <div className="ella-qty-row">
            <span className="ella-eyebrow">Quantity</span>
            <div className="ella-qty-controls">
              <button
                type="button"
                className="ella-qty-btn"
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQty((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <span className="ella-qty-value">{qty}</span>
              <button
                type="button"
                className="ella-qty-btn"
                aria-label="Increase quantity"
                disabled={qty >= maxQty}
                onClick={() => setQty((n) => Math.min(maxQty, n + 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="ella-form-actions">
            <button type="button" className="ella-btn" onClick={add} disabled={maxQty <= 0}>
              Add to cart
            </button>
            {inCart > 0 ? (
              <button type="button" className="ella-btn ella-btn-outline" onClick={onOpenCart}>
                View cart ({inCart})
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
