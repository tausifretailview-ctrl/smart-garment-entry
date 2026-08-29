import { useMemo, useRef, useState } from "react";
import { storefrontHomePath } from "@/lib/storefrontPath";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import { ellaCopy, ELLA_CATEGORY_CHIPS, type EllaChipCategory } from "./storefrontTheme";
import { ellaStockBadgeClass, isEllaProductPurchasable } from "./ellaStock";
import { filterEllaProducts, type EllaStorefrontProduct } from "./ellaProduct";

function CornerMarks() {
  return (
    <>
      <span className="ella-mark ella-mark-tl" aria-hidden>
        +
      </span>
      <span className="ella-mark ella-mark-tr" aria-hidden>
        +
      </span>
      <span className="ella-mark ella-mark-bl" aria-hidden>
        +
      </span>
      <span className="ella-mark ella-mark-br" aria-hidden>
        +
      </span>
    </>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm5.8 14.2c-.24.7-1.4 1.3-1.9 1.35-.5.06-1.1.08-1.8-.1-.4-.1-.95-.3-1.6-.6-2.9-1.25-4.8-4.2-4.9-4.4-.15-.2-1.2-1.6-1.2-3.05 0-1.45.75-2.15 1.05-2.45.24-.24.55-.35.75-.35h.55c.18 0 .4-.02.6.45.24.55.8 1.9.85 2.05.06.14.1.32 0 .5-.1.2-.15.32-.3.5-.14.16-.3.36-.44.5-.14.14-.3.3-.13.6.18.3.8 1.3 1.7 2.1 1.2 1.05 2.15 1.4 2.45 1.55.3.14.5.12.68-.08.2-.2.8-.9 1-1.2.2-.3.4-.25.65-.15.26.1 1.65.78 1.93.92.28.14.46.2.53.32.08.13.08.7-.16 1.4z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 9h3V6h-3a3 3 0 00-3 3v2H8v3h3v7h3v-7h3l1-3h-4V9a1 1 0 011-1z" />
    </svg>
  );
}

export function EllaStorefrontHome({
  shopName,
  orgSlug,
  whatsapp,
  logoUrl,
  address,
  instagramUrl,
  facebookUrl,
  products,
  cartCount = 0,
  onOpenProduct,
  onOpenGeneralEnquire,
  onOpenCart,
}: {
  shopName: string;
  orgSlug: string;
  whatsapp?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  products: EllaStorefrontProduct[];
  cartCount?: number;
  onOpenProduct: (product: EllaStorefrontProduct) => void;
  onOpenGeneralEnquire: () => void;
  onOpenCart?: () => void;
}) {
  const [chip, setChip] = useState<EllaChipCategory>("All");
  const [search, setSearch] = useState("");
  const collectionRef = useRef<HTMLElement | null>(null);
  const filtered = useMemo(() => filterEllaProducts(products, chip, search), [products, chip, search]);
  const dense = Boolean(search.trim()) || chip !== "All";
  const hero = products.find((p) => p.images[0])?.images[0] || "";
  const shareUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  const studioWa = whatsappShareUrl(storefrontWhatsAppShareText(shopName, shareUrl), whatsapp);
  const visitLine = (address || "").trim() || ellaCopy.address;
  const homeHref = storefrontHomePath(orgSlug);

  const selectChip = (next: EllaChipCategory) => {
    setChip(next);
    setSearch("");
    collectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <header className="ella-site-header">
        <div className="ella-site-header-inner">
          <a className="ella-site-brand" href={homeHref}>
            {logoUrl ? <img src={logoUrl} alt="" className="ella-site-logo" /> : null}
            <span className="ella-display ella-site-wordmark">{ellaCopy.wordmark}</span>
          </a>
          <nav className="ella-site-nav" aria-label="Collections">
            {ELLA_CATEGORY_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ella-nav-link${chip === c ? " ella-nav-link-active" : ""}`}
                onClick={() => selectChip(c)}
              >
                {c}
              </button>
            ))}
          </nav>
          <div className="ella-site-tools">
            <input
              className="ella-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search styles"
              aria-label="Search styles"
            />
            <a className="ella-wa-pill" href={studioWa} target="_blank" rel="noreferrer">
              <WhatsAppGlyph />
              WhatsApp
            </a>
            {cartCount > 0 && onOpenCart ? (
              <button type="button" className="ella-header-btn ella-header-btn-ghost" onClick={onOpenCart}>
                Cart ({cartCount})
              </button>
            ) : null}
            <button type="button" className="ella-header-btn" onClick={onOpenGeneralEnquire}>
              Enquire
            </button>
          </div>
        </div>
      </header>

      <section className="ella-hero ella-frame">
        <CornerMarks />
        {hero ? (
          <img src={hero} alt={`${shopName} collection`} decoding="async" />
        ) : (
          <div className="ella-hero-ph" />
        )}
        <div className="ella-hero-veil" />
        <div className="ella-hero-center">
          <div className="ella-display ella-wordmark">{ellaCopy.wordmark}</div>
          <div className="ella-eyebrow ella-designer">{ellaCopy.designer}</div>
        </div>
        <div className="ella-hero-foot">
          <div className="ella-display ella-collection-title">{ellaCopy.collectionTitle}</div>
          <p className="ella-collection-lead">{ellaCopy.collectionLead}</p>
        </div>
      </section>

      <section ref={collectionRef} className="ella-main" id="collection">
        <div className="ella-section">
          <h2 className="ella-display">The collection</h2>
          <div className="ella-count">
            {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="ella-empty">No pieces match this search.</p>
        ) : (
          <ul className={`ella-grid${dense ? " ella-card-dense" : ""}`}>
            {filtered.map((product, index) => (
              <li key={product.id}>
                <button type="button" className="ella-card" onClick={() => onOpenProduct(product)}>
                  <div className="ella-card-img">
                    {product.images[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        loading={index < 2 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    ) : null}
                    <span className={ellaStockBadgeClass(product.stock.state)}>{product.stock.label}</span>
                  </div>
                  <div className="ella-card-body">
                    <div className="ella-display ella-card-name">{product.name}</div>
                    <div className="ella-eyebrow">{product.category}</div>
                    {product.priceLabel ? <div className="ella-price">{product.priceLabel}</div> : null}
                    <div className="ella-card-enquire">
                      {isEllaProductPurchasable(product.stock) ? "Add to cart" : "Enquire"}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <section className="ella-note ella-frame">
          <CornerMarks />
          <p>{ellaCopy.studioNote}</p>
          <p className="ella-note-address">{visitLine}</p>
        </section>
      </section>

      <footer className="ella-site-footer">
        <div className="ella-site-footer-inner">
          <div className="ella-footer-col">
            <div className="ella-display ella-footer-heading">{ellaCopy.wordmark}</div>
            <p className="ella-footer-copy">{ellaCopy.designer}</p>
            <p className="ella-footer-copy">{ellaCopy.studioNote}</p>
          </div>
          <div className="ella-footer-col">
            <div className="ella-footer-label">Collections</div>
            {ELLA_CATEGORY_CHIPS.map((c) => (
              <button key={c} type="button" className="ella-footer-link" onClick={() => selectChip(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="ella-footer-col">
            <div className="ella-footer-label">Visit</div>
            <p className="ella-footer-copy">{visitLine}</p>
            <p className="ella-footer-copy">{ellaCopy.hours}</p>
          </div>
          <div className="ella-footer-col">
            <div className="ella-footer-label">Connect</div>
            <a className="ella-footer-link" href={studioWa} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            {instagramUrl ? (
              <a className="ella-footer-link ella-footer-social" href={instagramUrl} target="_blank" rel="noreferrer">
                <InstagramIcon /> Instagram
              </a>
            ) : null}
            {facebookUrl ? (
              <a className="ella-footer-link ella-footer-social" href={facebookUrl} target="_blank" rel="noreferrer">
                <FacebookIcon /> Facebook
              </a>
            ) : null}
            <p className="ella-footer-copy">{ellaCopy.erpNote}</p>
          </div>
        </div>
      </footer>

      <div className="ella-action-bar">
        {cartCount > 0 && onOpenCart ? (
          <button type="button" className="ella-btn ella-btn-outline ella-cart-btn" onClick={onOpenCart}>
            Cart ({cartCount})
          </button>
        ) : null}
        <button type="button" className="ella-btn" onClick={onOpenGeneralEnquire}>
          Enquire
        </button>
        <a className="ella-btn ella-btn-square ella-btn-outline" href={studioWa} target="_blank" rel="noreferrer" aria-label="WhatsApp">
          <WhatsAppGlyph />
        </a>
      </div>
    </>
  );
}

export function EllaStorefrontSkeleton() {
  return (
    <div className="ella-store" aria-busy="true">
      <div className="ella-site-header">
        <div className="ella-site-header-inner">
          <div className="ella-display ella-site-wordmark">{ellaCopy.wordmark}</div>
        </div>
      </div>
      <div className="ella-hero ella-hero-ph" />
      <div className="ella-skel-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ella-skel-card">
            <div className="ella-skel-img" />
            <div className="ella-skel-line" />
            <div className="ella-skel-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}
