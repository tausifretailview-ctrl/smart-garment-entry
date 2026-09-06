import { useEffect, useMemo, useState } from "react";
import type { EllaStorefrontProduct } from "./ellaProduct";
import { addToEllaCart, ellaCartLineKey, type EllaCartLine } from "./ellaCart";
import { findSize, type EllaSizeOption } from "./ellaVariants";
import { useLockBodyScroll } from "./ellaLockBody";

const SIZE_CHART: Array<{ size: string; bust: string; waist: string; length: string }> = [
  { size: "FS", bust: "42", waist: "40", length: "46" },
  { size: "S", bust: "36", waist: "34", length: "44" },
  { size: "M", bust: "38", waist: "36", length: "45" },
  { size: "L", bust: "40", waist: "38", length: "45" },
  { size: "XL", bust: "42", waist: "40", length: "46" },
];

type PanelId = "details" | "care" | "mto" | "shipping" | null;

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

  const [sizeLabel, setSizeLabel] = useState<string | null>(product.defaultSize?.label ?? null);
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [panel, setPanel] = useState<PanelId>("details");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  const size: EllaSizeOption | null = useMemo(
    () => findSize(product.sizes, sizeLabel) ?? product.defaultSize,
    [product.sizes, product.defaultSize, sizeLabel],
  );

  const maxQty = size && size.availableKnown ? Math.max(1, size.available) : 1;
  const canBuy = Boolean(size?.inStock);

  const inCart = useMemo(() => {
    const key = ellaCartLineKey(product.productId, size?.label ?? null);
    return cart.find((line) => line.key === key)?.qty ?? 0;
  }, [cart, product.productId, size]);

  useEffect(() => {
    setSizeLabel(product.defaultSize?.label ?? null);
    setQty(1);
    setImageIndex(0);
  }, [product.productId, product.defaultSize]);

  useEffect(() => {
    setQty((current) => Math.min(Math.max(1, current), maxQty));
  }, [maxQty, sizeLabel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = (thenCheckout: boolean) => {
    if (!canBuy) return;
    onAddToCart(addToEllaCart(cart, product, size, qty));
    if (thenCheckout) onOpenCart();
  };

  const images = product.images.length > 0 ? product.images : [];
  const activeImage = images[imageIndex] || images[0] || "";

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close product" onClick={onClose} />
      <section
        className="ella-sheet ella-sheet-product"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ella-product-title"
      >
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">{product.sectionLabel || product.category}</div>
              <h2 id="ella-product-title" className="ella-display ella-sheet-name">
                {product.name}
              </h2>
              <div className="ella-sheet-sub">
                Style {product.code} · {product.fabric}
              </div>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {activeImage ? (
            <div className="ella-pdp-gallery">
              <div className="ella-sheet-img">
                <img src={activeImage} alt={product.name} decoding="async" />
              </div>
              {images.length > 1 ? (
                <div className="ella-pdp-thumbs">
                  {images.slice(0, 5).map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      className={`ella-pdp-thumb${i === imageIndex ? " ella-pdp-thumb-active" : ""}`}
                      onClick={() => setImageIndex(i)}
                      aria-label={`View image ${i + 1}`}
                    >
                      <img src={src} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="ella-price-row">
            {product.priceLabel ? <div className="ella-price ella-price-lg">{product.priceLabel}</div> : null}
            <span className="ella-tax-note">Inclusive of all taxes</span>
          </div>

          <div className="ella-size-head">
            <span className="ella-eyebrow">Select size</span>
            <button
              type="button"
              className="ella-link-underline"
              onClick={() => setSizeGuideOpen((v) => !v)}
            >
              Size guide
            </button>
          </div>

          <div className="ella-size-row" role="group" aria-label="Select size">
            {product.sizes.map((option) => {
              const active = option.label === size?.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  className={`ella-size-btn${active ? " ella-size-btn-active" : ""}${
                    option.inStock ? "" : " ella-size-btn-out"
                  }`}
                  aria-pressed={active}
                  disabled={!option.inStock}
                  onClick={() => setSizeLabel(option.label)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className={`ella-stock-note${size?.low ? " ella-stock-note-low" : ""}`}>
            {canBuy
              ? `${size?.stockLabel} in ${size?.label} · dispatched in 48 hours`
              : "Sold out in this size — enquire and we will cut it to order in 3–4 weeks"}
          </div>

          {sizeGuideOpen ? (
            <div className="ella-size-guide">
              <div className="ella-size-guide-head">
                <span>Size guide · inches</span>
                <button type="button" className="ella-close-sm" onClick={() => setSizeGuideOpen(false)} aria-label="Close size guide">
                  ×
                </button>
              </div>
              <table className="ella-size-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Bust</th>
                    <th>Waist</th>
                    <th>Length</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_CHART.map((row) => (
                    <tr key={row.size}>
                      <td>{row.size}</td>
                      <td>{row.bust}</td>
                      <td>{row.waist}</td>
                      <td>{row.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

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

          <div className="ella-form-actions ella-pdp-actions">
            <button type="button" className="ella-btn ella-btn-ink" disabled={!canBuy} onClick={() => add(false)}>
              Add to bag
            </button>
            <button type="button" className="ella-btn" disabled={!canBuy} onClick={() => add(true)}>
              Buy now
            </button>
            {inCart > 0 ? (
              <button type="button" className="ella-btn ella-btn-outline" onClick={onOpenCart}>
                View bag ({inCart})
              </button>
            ) : null}
          </div>

          <div className="ella-assure">
            <div>
              <div className="ella-assure-label">Delivery</div>
              <div className="ella-assure-value">Ships in 48 hrs</div>
            </div>
            <div>
              <div className="ella-assure-label">Payment</div>
              <div className="ella-assure-value">UPI · COD</div>
            </div>
            <div>
              <div className="ella-assure-label">Exchange</div>
              <div className="ella-assure-value">7 days, unworn</div>
            </div>
          </div>

          <div className="ella-panels">
            <Panel
              id="details"
              title="Details & fit"
              open={panel === "details"}
              onToggle={setPanel}
            >
              {product.name} in {product.fabric}. Style code {product.code}. Measurements in the size
              guide above; sizes shown are the ones currently on the rack.
            </Panel>
            <Panel id="care" title="Fabric & care" open={panel === "care"} onToggle={setPanel}>
              Dry clean recommended for the first wash. Thereafter hand wash cold and separately, and
              dry in shade to protect the thread work.
            </Panel>
            <Panel id="mto" title="Made-to-order timeline" open={panel === "mto"} onToggle={setPanel}>
              Not in stock in your size? We cut it for you — measurements confirmed on WhatsApp in 2
              days, stitching 2 weeks, finishing and QC 3 days, dispatch in week four. Pay 30% to
              start; the balance before dispatch.
            </Panel>
            <Panel id="shipping" title="Shipping & exchange" open={panel === "shipping"} onToggle={setPanel}>
              Free prepaid shipping across India. Cash on delivery up to ₹10,000 with an ₹80 handling
              fee, ready-to-wear only. Exchange within 7 days if unworn with tags; made-to-order
              pieces are final sale.
            </Panel>
          </div>
        </div>
      </section>
    </>
  );
}

function Panel({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: Exclude<PanelId, null>;
  title: string;
  open: boolean;
  onToggle: (next: PanelId) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="ella-panel">
      <button
        type="button"
        className="ella-panel-head"
        aria-expanded={open}
        onClick={() => onToggle(open ? null : id)}
      >
        <span className="ella-display ella-panel-title">{title}</span>
        <span className="ella-panel-sign" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="ella-panel-body">{children}</div> : null}
    </div>
  );
}
