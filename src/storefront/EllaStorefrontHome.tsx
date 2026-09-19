/**
 * Ella'Noor storefront home — editorial rebuild.
 *
 * Drop-in replacement for the existing src/storefront/EllaStorefrontHome.tsx:
 * same file path, same two exports (EllaStorefrontHome, EllaStorefrontSkeleton)
 * and the exact same props, so EllaStorefront.tsx and StorefrontApp.tsx need
 * no changes. All stock / variant / cart logic still comes from the existing
 * helpers — this file only owns layout, copy and chrome.
 *
 * Stock counts deliberately do NOT appear on cards (studio decision); the
 * product sheet remains the only place a quantity is shown. Cards carry one
 * neutral "Made to order" flag when the ERP reports zero on hand.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicStorefrontMenu } from "@/lib/websiteTypes";
import type { PublicStorefrontSection } from "@/lib/websiteSections";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import {
  applyEllaFilters,
  ELLA_DEFAULT_FILTERS,
  type EllaFilterState,
  type EllaSortKey,
  type EllaStorefrontProduct,
} from "./ellaProduct";
import { resolveEllaHeaderNav, isEllaHomeNav, type EllaHeaderNavItem } from "./ellaNav";
import { ellaCopy, storefrontLocationLine } from "./storefrontTheme";
import "./ella-home.css";

type Props = {
  shopName: string;
  orgSlug: string;
  whatsapp?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  products: EllaStorefrontProduct[];
  sections?: PublicStorefrontSection[];
  menus?: PublicStorefrontMenu[];
  cartCount: number;
  onOpenProduct: (product: EllaStorefrontProduct) => void;
  onOpenGeneralEnquire: () => void;
  onOpenCart: () => void;
  onNavigate: () => void;
};

const PROMISES = [
  ["Live studio inventory", "The styles shown here are genuinely available from our atelier."],
  ["Ready in 48 hours", "Ready-to-wear pieces dispatch within two working days."],
  ["Made for you", "Formal and bridal pieces are cut to your measurements in 3–4 weeks."],
  ["Easy shopping", "Secure UPI, cards and COD up to ₹10,000. Seven-day exchange on eligible pieces."],
];

const STEPS = [
  ["01", "Choose your style", "Select the silhouette you love and reserve your production slot."],
  ["02", "Share your measurements", "Send them on WhatsApp or save them to your profile. We’ll confirm them within two days."],
  ["03", "We create your piece", "Your garment is stitched, hand-finished and quality checked by our atelier."],
  ["04", "Final payment & delivery", "Pay the balance when your piece is ready. We dispatch it with tracking in week four."],
];

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

function HangerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M12 8.5a2.2 2.2 0 1 1 2.2-2.2" />
      <path d="M12 8.5v2L3.8 16.1a1.2 1.2 0 0 0 .7 2.2h15a1.2 1.2 0 0 0 .7-2.2L12 10.5" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2Zm5.8 14.1c-.25.7-1.43 1.33-1.98 1.38-.53.05-1.02.24-3.45-.72-2.9-1.14-4.74-4.1-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.37c.26-.29.57-.36.76-.36l.54.01c.17 0 .41-.07.64.49.24.57.8 1.97.87 2.11.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.37-.43.5-.14.14-.29.29-.12.57.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.41.29.14.45.12.62-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.64-.14.26.09 1.66.78 1.94.93.29.14.48.21.55.33.07.12.07.69-.18 1.39Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" />
    </svg>
  );
}

function ProductCard({
  product,
  onOpen,
}: {
  product: EllaStorefrontProduct;
  onOpen: (p: EllaStorefrontProduct) => void;
}) {
  const image = product.images[0];
  return (
    <button type="button" className="en-card" onClick={() => onOpen(product)}>
      <span className="en-card-media">
        {image ? (
          <img src={image} alt={product.name} loading="lazy" />
        ) : (
          <span className="en-empty">Photo coming soon</span>
        )}
        {product.madeToOrder ? <span className="en-flag">Made to order</span> : null}
      </span>
      <span className="en-card-code">{product.code}</span>
      <span className="en-card-name">{product.name}</span>
      <span className="en-card-price">{product.priceLabel}</span>
    </button>
  );
}

export function EllaStorefrontHome({
  shopName,
  whatsapp,
  logoUrl,
  address,
  instagramUrl,
  products,
  sections = [],
  menus = [],
  cartCount,
  onOpenProduct,
  onOpenGeneralEnquire,
  onOpenCart,
  onNavigate,
}: Props) {
  const nav = useMemo(() => resolveEllaHeaderNav(menus, sections), [menus, sections]);
  const [active, setActive] = useState<EllaHeaderNavItem>(() => nav[0]);
  const [filters, setFilters] = useState<EllaFilterState>(ELLA_DEFAULT_FILTERS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActive((current) => nav.find((n) => n.id === current?.id) || nav[0]);
  }, [nav]);

  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, searchOpen]);

  const onHome = isEllaHomeNav(active);

  const visible = useMemo(() => {
    const base: EllaFilterState = {
      ...filters,
      chip: onHome ? "all" : active.chip,
      sort: filters.sort === "featured" ? active.sort : filters.sort,
      inStockOnly: filters.inStockOnly || active.availability === "in-stock",
    };
    const list = applyEllaFilters(products, base);
    return active.availability === "made-to-order" ? list.filter((p) => p.madeToOrder) : list;
  }, [products, filters, active, onHome]);

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return applyEllaFilters(products, { ...ELLA_DEFAULT_FILTERS, search: q });
  }, [products, query]);

  const hero = products.find((p) => p.images.length > 0);
  const location = storefrontLocationLine(address);
  const waHref = whatsapp ? whatsappShareUrl(`Hi ${shopName}, I'd like to ask about a piece.`, whatsapp) : null;

  const select = (item: EllaHeaderNavItem) => {
    setActive(item);
    setMenuOpen(false);
    setSearchOpen(false);
    onNavigate();
    if (!isEllaHomeNav(item)) {
      window.requestAnimationFrame(() => {
        const top = gridRef.current?.getBoundingClientRect().top ?? 0;
        window.scrollTo({ top: Math.max(0, window.scrollY + top - 90), behavior: "smooth" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const byId = (id: string) => nav.find((n) => n.id === id) || nav[0];

  return (
    <div className="en-home">
      <div className="en-announce">
        <i />
        <span>Live studio inventory · dispatch in 48 hours</span>
      </div>

      <header className="en-header">
        <div className="en-header-row">
          <button type="button" className="en-icon en-burger" aria-label="Menu" onClick={() => setMenuOpen(true)}>
            <span />
            <span />
            <span />
          </button>

          <button type="button" className="en-brand" onClick={() => select(nav[0])}>
            {logoUrl ? (
              <img className="en-brand-logo" src={logoUrl} alt={shopName} />
            ) : (
              <>
                <b>{shopName.toUpperCase()}</b>
                <span>Chikankari atelier</span>
              </>
            )}
          </button>

          <div className="en-spacer" />

          <nav className="en-nav">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === active.id && !onHome}
                onClick={() => select(item)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button type="button" className="en-icon" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </button>
          <button type="button" className="en-icon" aria-label="Enquire" onClick={onOpenGeneralEnquire}>
            <UserIcon />
          </button>
          <button type="button" className="en-icon" aria-label="Bag" onClick={onOpenCart}>
            <BagIcon />
            {cartCount > 0 ? <span className="en-badge">{cartCount}</span> : null}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="en-overlay" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="en-overlay-head">
            <span className="en-eyebrow">Menu</span>
            <div className="en-spacer" />
            <button type="button" className="en-icon en-close" aria-label="Close" onClick={() => setMenuOpen(false)}>
              ×
            </button>
          </div>
          <div className="en-overlay-body">
            {nav.map((item) => (
              <button key={item.id} type="button" className="en-menu-link" onClick={() => select(item)}>
                {item.label}
              </button>
            ))}
            <div className="en-menu-foot">
              <button type="button" className="en-btn" onClick={onOpenGeneralEnquire}>
                Start your order
              </button>
              {waHref ? (
                <a className="en-menu-contact" href={waHref}>
                  <WhatsAppGlyph />
                  WhatsApp the studio
                </a>
              ) : null}
              {address ? <span className="en-menu-address">{address}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="en-overlay" role="dialog" aria-modal="true" aria-label="Search">
          <div className="en-overlay-head">
            <SearchIcon />
            <input
              className="en-search-input"
              value={query}
              autoFocus
              placeholder="Search style code, fabric or occasion"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="en-linkbtn" onClick={() => setSearchOpen(false)}>
              Close
            </button>          </div>
          <div className="en-overlay-body">
            {query.trim() ? (
              <p className="en-eyebrow" style={{ marginTop: 0 }}>
                {searchResults.length} {searchResults.length === 1 ? "piece" : "pieces"} found
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {["Chikankari", "Cotton", "Festive", "Bridal", "Ready"].map((term) => (
                  <button key={term} type="button" className="en-chiplink" onClick={() => setQuery(term)}>
                    {term}
                  </button>
                ))}
              </div>
            )}
            <div className="en-grid" style={{ marginTop: 24 }}>
              {searchResults.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onOpen={(product) => {
                    setSearchOpen(false);
                    onOpenProduct(product);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {onHome ? (
        <>
          <section className="en-wrap">
            <div className="en-hero">
              <div className="en-hero-copy">
                <span className="en-eyebrow">In studio now</span>
                <h1>
                  Everyday chikankari,
                  <br />
                  <em>festive formals.</em>
                </h1>
                <p className="en-lead">
                  Hand-worked pieces cut in our atelier. What you see here is genuinely available — stock reads
                  straight from the studio rack.
                </p>
                <div className="en-actions">
                  <button type="button" className="en-btn" onClick={() => select(byId("ready"))}>
                    Shop ready to wear
                  </button>
                  <button type="button" className="en-btn en-btn-outline" onClick={onOpenGeneralEnquire}>
                    Made to order
                  </button>
                </div>
              </div>
              <div className="en-figure">
                {hero ? <img src={hero.images[0]} alt={hero.name} /> : <span className="en-empty">Studio photograph</span>}
              </div>
            </div>
          </section>

          <section className="en-wrap">
            <div className="en-promises">
              {PROMISES.map(([title, body]) => (
                <div className="en-promise" key={title}>
                  <b>{title}</b>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="en-wrap en-section" ref={gridRef}>
        <div className="en-section-head">
          <h2>{onHome ? "New in" : active.title}</h2>
          {onHome ? (
            <button type="button" className="en-linkbtn" onClick={() => select(byId("new-in"))}>
              View all pieces
            </button>
          ) : null}
        </div>
        {!onHome && active.lead ? <p className="en-lead">{active.lead}</p> : null}

        {!onHome ? (
          <>
            <div className="en-chips">
              {(["featured", "newest", "price-asc", "price-desc"] as EllaSortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="en-chip"
                  aria-pressed={filters.sort === key}
                  onClick={() => setFilters((f) => ({ ...f, sort: key }))}
                >
                  {key === "featured" ? "Featured" : key === "newest" ? "Newest" : key === "price-asc" ? "Price ↑" : "Price ↓"}
                </button>
              ))}
            </div>
            <div className="en-filters">
              <span className="en-eyebrow">
                {visible.length} {visible.length === 1 ? "piece" : "pieces"}
              </span>
              <label className="en-check">
                <input
                  type="checkbox"
                  checked={filters.inStockOnly}
                  onChange={(e) => setFilters((f) => ({ ...f, inStockOnly: e.target.checked }))}
                />
                In stock only
              </label>
            </div>
          </>
        ) : null}

        <div className="en-grid">
          {(onHome ? visible.slice(0, 6) : visible).map((p) => (
            <ProductCard key={p.id} product={p} onOpen={onOpenProduct} />
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="en-lead" style={{ marginTop: 40 }}>
            Nothing matches that filter right now. Ask the studio on WhatsApp and we’ll find you something.
          </p>
        ) : null}
      </section>

      {onHome ? (
        <>
          <section className="en-wrap en-section">
            <div className="en-cols">
              <div className="en-col">
                <div className="en-figure">
                  {products[1]?.images[0] ? <img src={products[1].images[0]} alt="Ready to wear" /> : <span className="en-empty">Photo</span>}
                </div>
                <h3>Ready to wear</h3>
                <p>Made beautifully. Ready to go.</p>
                <button type="button" className="en-btn-text" onClick={() => select(byId("ready"))}>
                  Shop ready to wear
                </button>
              </div>
              <div className="en-col">
                <div className="en-figure">
                  {products[2]?.images[0] ? <img src={products[2].images[0]} alt="Formals" /> : <span className="en-empty">Photo</span>}
                </div>
                <h3>Formals</h3>
                <p>Statement silhouettes for special occasions.</p>
                <button type="button" className="en-btn-text" onClick={() => select(byId("formals"))}>
                  Explore formals
                </button>
              </div>
              <div className="en-col">
                <div className="en-figure">
                  {products[3]?.images[0] ? <img src={products[3].images[0]} alt="Made to order" /> : <span className="en-empty">Photo</span>}
                </div>
                <h3>Made to order</h3>
                <p>Your measurements. Our craftsmanship.</p>
                <button type="button" className="en-btn-text" onClick={onOpenGeneralEnquire}>
                  Start your order
                </button>
              </div>
            </div>
          </section>

          <section className="en-wrap en-section">
            <div className="en-split">
              <div className="en-hero-copy" style={{ padding: 0, gap: 14 }}>
                <span className="en-eyebrow">Made for you</span>
                <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 600, lineHeight: 1.08 }}>
                  Your perfect fit, from our atelier
                </h2>
                <p className="en-lead">
                  Choose your style, share your measurements, and let our atelier make it especially for you. A 30%
                  advance reserves your piece; we keep you updated from cutting to dispatch.
                </p>
                <button type="button" className="en-btn" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={onOpenGeneralEnquire}>
                  Start a made-to-order enquiry
                </button>
              </div>
              <div className="en-steps">
                {STEPS.map(([num, title, body]) => (
                  <div key={num} style={{ display: "contents" }}>
                    <span className="en-num">{num}</span>
                    <div>
                      <b>{title}</b>
                      <p>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      <footer className="en-footer">
        <div className="en-wrap en-footer-grid">
          <div className="en-footer-col">
            <b style={{ fontSize: 22, letterSpacing: "0.1em", color: "var(--en-ink)", textTransform: "none" }}>
              {shopName}
            </b>
            <span style={{ maxWidth: "30ch" }}>{ellaCopy.studioNote}</span>
          </div>
          <div className="en-footer-col">
            <b>Shop</b>
            {nav.filter((n) => !isEllaHomeNav(n)).map((item) => (
              <button key={item.id} type="button" onClick={() => select(item)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="en-footer-col">
            <b>Help</b>
            <span>Seven-day exchange</span>
            <span>Free shipping in India</span>
            <span>COD up to ₹10,000</span>
          </div>
          <div className="en-footer-col">
            <b>Studio</b>
            {waHref ? <a href={waHref}>WhatsApp the studio</a> : null}
            {instagramUrl ? (
              <a href={instagramUrl} aria-label="Instagram">
                Instagram
              </a>
            ) : null}
            {location ? <span>{location}</span> : null}
            <span>{ellaCopy.hours}</span>
          </div>
        </div>
        <div className="en-wrap en-colophon">
          © {new Date().getFullYear()} {shopName} · {ellaCopy.erpNote}
        </div>
      </footer>

      <nav className="en-tabs">
        <button type="button" className="en-tab" aria-current={!onHome} onClick={() => select(byId("new-in"))}>
          <span className="en-tab-ico">
            <HangerIcon />
          </span>
          <span>Shop</span>
        </button>
        <button type="button" className="en-tab" aria-current={searchOpen} onClick={() => setSearchOpen(true)}>
          <span className="en-tab-ico">
            <SearchIcon />
          </span>
          <span>Search</span>
        </button>
        <button type="button" className="en-tab" onClick={onOpenCart}>
          <span className="en-tab-ico">
            <BagIcon />
            {cartCount > 0 ? <span className="en-badge">{cartCount}</span> : null}
          </span>
          <span>Bag</span>
        </button>
        {waHref ? (
          <a className="en-tab en-tab-wa" href={waHref} target="_blank" rel="noreferrer">
            <span className="en-tab-ico">
              <WhatsAppGlyph />
            </span>
            <span>WhatsApp</span>
          </a>
        ) : (
          <button type="button" className="en-tab" onClick={onOpenGeneralEnquire}>
            <span className="en-tab-ico">
              <UserIcon />
            </span>
            <span>Enquire</span>
          </button>
        )}
      </nav>
    </div>
  );
}

export function EllaStorefrontSkeleton() {
  return (
    <div className="en-home">
      <div className="en-skel">
        <div className="en-skel-box head" />
        <div className="en-skel-row">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <div className="en-skel-box tall" />
              <div className="en-skel-box line" style={{ width: "70%" }} />
              <div className="en-skel-box line" style={{ width: "40%" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
