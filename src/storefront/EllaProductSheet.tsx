import { useEffect, useMemo, useState } from "react";
import { ellaMaxPurchaseQty, ellaStockBadgeClass } from "./ellaStock";
import type { EllaStorefrontProduct } from "./ellaProduct";
import { addToEllaCart, type EllaCartLine } from "./ellaCart";
import { useLockBodyScroll } from "./ellaLockBody";

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
  const maxQty = ellaMaxPurchaseQty(product.stock, product.availableKnown);
  const [qty, setQty] = useState(1);
  const inCart = useMemo(
    () => cart.find((line) => line.productId === product.productId)?.qty ?? 0,
    [cart, product.productId],
  );

  useEffect(() => {
    setQty((current) => Math.min(Math.max(1, current), maxQty));
  }, [maxQty, product.productId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = () => {
    onAddToCart(addToEllaCart(cart, product, qty));
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

          {product.images[0] ? (
            <div className="ella-sheet-img">
              <img src={product.images[0]} alt={product.name} decoding="async" />
            </div>
          ) : null}

          <div className="ella-price-row">
            {product.priceLabel ? <div className="ella-price">{product.priceLabel}</div> : null}
            <span className={ellaStockBadgeClass(product.stock.state)} style={{ position: "static" }}>
              {product.stock.label}
            </span>
          </div>

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
              <dd>{product.stock.label}</dd>
            </div>
          </dl>

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
            <button type="button" className="ella-btn" onClick={add}>
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
