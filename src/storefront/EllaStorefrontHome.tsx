import { useMemo, useRef, useState } from "react";
import { storefrontHomePath } from "@/lib/storefrontPath";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import { ellaCopy, ELLA_CATEGORY_CHIPS } from "./storefrontTheme";
import { ellaNavChipsFromSections, groupProductsBySection, type PublicStorefrontSection } from "@/lib/websiteSections";
import { ellaStockBadgeClass } from "./ellaStock";
import {
  applyEllaFilters,
  ellaPriceCeiling,
  ELLA_DEFAULT_FILTERS,
  type EllaFilterState,
  type EllaSortKey,
  type EllaStorefrontProduct,
} from "./ellaProduct";
import { catalogueSizeFacets } from "./ellaVariants";

const SORT_OPTIONS: Array<{ id: EllaSortKey; label: string }> = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "in-stock", label: "In stock first" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
];

function CornerMarks() {
  return (
    <>
      <span className="ella-mark ella-mark-tl" aria-hidden>+</span>
      <span className="ella-mark ella-mark-tr" aria-hidden>+</span>
      <span className="ella-mark ella-mark-bl" aria-hidden>+</span>
      <span className="ella-mark ella-mark-br" aria-hidden>+</span>
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

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
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
  sections = [],
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
  sections?: PublicStorefrontSection[];
  cartCount?: number;
  onOpenProduct: (product: EllaStorefrontProduct) => void;
  onOpenGeneralEnquire: () => void;
  onOpenCart?: () => void;
}) {
  const navChips = useMemo(() => ellaNavChipsFromSections(sections, ELLA_CATEGORY_CHIPS), [sections]);
  const [filters, setFilters] = useState<EllaFilterState>(ELLA_DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const collectionRef = useRef<HTMLElement | null>(null);

  const sizeFacets = useMemo(() => catalogueSizeFacets(products), [products]);
  const priceCeiling = useMemo(() => ellaPriceCeiling(products), [products]);
  const filtered = useMemo(() => applyEllaFilters(products, filters), [products, filters]);
  const grouped = useMemo(() => groupProductsBySection(filtered, sections), [filtered, sections]);

  const facetsActive =
    filters.inStockOnly || filters.sizes.length > 0 || filters.maxPrice != null || Boolean(filters.search.trim());
  const showGrouped =
    sections.length > 0 && (filters.chip === "all" || filters.chip === "All") && !facetsActive && filters.sort === "featured";

  const inStockCount = useMemo(() => products.filter((p) => p.available > 0).length, [products]);
  const hero = products.find((p) => p.images[0])?.images[0] || "";
  const shareUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  const studioWa = whatsappShareUrl(storefrontWhatsAppShareText(shopName, shareUrl), whatsapp);
  const visitLine = (address || "").trim() || ellaCopy.address;
  const homeHref = storefrontHomePath(orgSlug);

  const patch = (next: Partial<EllaFilterState>) => setFilters((prev) => ({ ...prev, ...next }));

  const selectChip = (next: string) => {
    patch({ chip: next });
    collectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleSize = (label: string) =>
    patch({
      sizes: filters.sizes.includes(label)
        ? filters.sizes.filter((s) => s !== label)
        : [...filters.sizes, label],
    });

  const renderProductCard = (product: EllaStorefrontProduct, index: number) => (
    <li key={product.id}>
      <div className="ella-card">
        <button
          type="button"
          className="ella-card-img"
          onClick={() => onOpenProduct(product)}
          aria-label={`${product.name} — ${product.priceLabel}`}
        >
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              loading={index < 4 ? "eager" : "lazy"}
              decoding="async"
            />
          ) : null}
          <span className={ellaStockBadgeClass(product.stock.state)}>{product.stock.label}</span>
        </button>
        <div className="ella-card-body">
          <button type="button" className="ella-display ella-card-name" onClick={() => onOpenProduct(product)}>
            {product.name}
          </button>
          <div className="ella-eyebrow ella-card-code">
            {product.code} · {product.sectionLabel || product.category}
          </div>
          <div className="ella-card-foot">
            {product.priceLabel ? <div className="ella-price">{product.priceLabel}</div> : null}
            {product.sizes.length > 0 ? (
              <div className="ella-card-sizes" aria-label="Sizes in stock">
                {product.sizes.map((size) => (
                  <span
                    key={size.label}
                    className={`ella-card-size${size.inStock ? "" : " ella-card-size-out"}`}
                  >
                    {size.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );

  return (
    <>
      <div className="ella-announce">
        <span>Free shipping on prepaid orders across India</span>
        <span aria-hidden>·</span>
        <span>COD up to ₹10,000</span>
        <span aria-hidden>·</span>
        <span>Made-to-order in 3–4 weeks</span>
      </div>

      <header className="ella-site-header">
        <div className="ella-site-header-inner">
          <a className="ella-site-brand" href={homeHref}>
            {logoUrl ? <img src={logoUrl} alt="" className="ella-site-logo" /> : null}
            <span className="ella-brand-stack">
              <span className="ella-display ella-site-wordmark">{ellaCopy.wordmark}</span>
              <span className="ella-site-tagline">{ellaCopy.designer}</span>
            </span>
          </a>

          <nav className="ella-site-nav" aria-label="Collections">
            {navChips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ella-nav-link${filters.chip === c.id ? " ella-nav-link-active" : ""}`}
                onClick={() => selectChip(c.id)}
              >
                {c.label}
              </button>
            ))}
          </nav>

          <div className="ella-site-tools">
            <div className="ella-search-wrap">
              <span className="ella-search-icon" aria-hidden>
                <SearchIcon />
              </span>
              <input
                className="ella-search"
                value={filters.search}
                onChange={(e) => patch({ search: e.target.value })}
                placeholder="Search style, colour or code"
                aria-label="Search styles"
              />
            </div>
            {whatsapp ? (
              <a className="ella-wa-pill" href={studioWa} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <WhatsAppGlyph />
                <span>WhatsApp</span>
              </a>
            ) : null}
            {instagramUrl ? (
              <a className="ella-social-icon" href={instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram">
                <InstagramIcon />
              </a>
            ) : null}
            {onOpenCart ? (
              <button type="button" className="ella-header-btn ella-header-btn-bag" onClick={onOpenCart}>
                <BagIcon />
                <span>Bag ({cartCount})</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="ella-hero ella-frame">
        <CornerMarks />
        {hero ? <img src={hero} alt={`${shopName} collection`} decoding="async" /> : <div className="ella-hero-ph" />}
        <div className="ella-hero-veil" />
        <div className="ella-hero-copy">
          <div className="ella-eyebrow ella-hero-kicker">{ellaCopy.collectionTitle}</div>
          <h1 className="ella-display ella-hero-title">{shopName}</h1>
          <p className="ella-hero-lead">{ellaCopy.collectionLead}</p>
          <div className="ella-hero-actions">
            <button type="button" className="ella-btn ella-hero-btn" onClick={() => selectChip("all")}>
              Shop the collection
            </button>
            <button type="button" className="ella-btn ella-btn-ghost-light ella-hero-btn" onClick={onOpenGeneralEnquire}>
              Made to order
            </button>
          </div>
          <div className="ella-hero-trust">
            <span className="ella-live-dot" aria-hidden />
            <span>{inStockCount} styles in stock now · live from Ezzy ERP</span>
          </div>
        </div>
      </section>

      <section className="ella-assure-strip">
        <div>
          <div className="ella-display ella-assure-strip-title">Live studio stock</div>
          <p>Sizes come straight from the ERP — nothing oversold.</p>
        </div>
        <div>
          <div className="ella-display ella-assure-strip-title">48-hour dispatch</div>
          <p>Ready-to-wear leaves the studio in two working days.</p>
        </div>
        <div>
          <div className="ella-display ella-assure-strip-title">Made to order</div>
          <p>Cut to your measurements in 3–4 weeks.</p>
        </div>
        <div>
          <div className="ella-display ella-assure-strip-title">UPI &amp; COD</div>
          <p>Verified UPI, or cash on delivery up to ₹10,000.</p>
        </div>
      </section>

      <section ref={collectionRef} className="ella-main" id="collection">
        <div className="ella-toolbar">
          <div className="ella-toolbar-left">
            <h2 className="ella-display ella-toolbar-title">
              {showGrouped ? "The collection" : navChips.find((c) => c.id === filters.chip)?.label || "The collection"}
            </h2>
            <span className="ella-count">
              {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
            </span>
          </div>
          <div className="ella-toolbar-right">
            <button
              type="button"
              className={`ella-filter-toggle${facetsActive ? " ella-filter-toggle-on" : ""}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              Filter{facetsActive ? " ·" : ""}
              {facetsActive ? <span className="ella-filter-dot" aria-hidden /> : null}
            </button>
            <label className="ella-sort">
              <span className="ella-sort-label">Sort</span>
              <select
                value={filters.sort}
                onChange={(e) => patch({ sort: e.target.value as EllaSortKey })}
                aria-label="Sort products"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filtersOpen ? (
          <div className="ella-filters">
            <div className="ella-filter-group">
              <div className="ella-filter-label">Availability</div>
              <label className="ella-check">
                <input
                  type="checkbox"
                  checked={filters.inStockOnly}
                  onChange={(e) => patch({ inStockOnly: e.target.checked })}
                />
                <span>In stock now ({inStockCount})</span>
              </label>
            </div>

            {sizeFacets.length > 0 ? (
              <div className="ella-filter-group">
                <div className="ella-filter-label">Size</div>
                <div className="ella-filter-sizes">
                  {sizeFacets.map((facet) => (
                    <button
                      key={facet.label}
                      type="button"
                      className={`ella-size-chip${filters.sizes.includes(facet.label) ? " ella-size-chip-on" : ""}`}
                      aria-pressed={filters.sizes.includes(facet.label)}
                      onClick={() => toggleSize(facet.label)}
                    >
                      {facet.label} <span>{facet.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {priceCeiling > 0 ? (
              <div className="ella-filter-group">
                <div className="ella-filter-label">
                  Under {filters.maxPrice ? `₹${filters.maxPrice.toLocaleString("en-IN")}` : `₹${priceCeiling.toLocaleString("en-IN")}`}
                </div>
                <input
                  type="range"
                  className="ella-range"
                  min={500}
                  max={priceCeiling}
                  step={500}
                  value={filters.maxPrice ?? priceCeiling}
                  onChange={(e) => patch({ maxPrice: Number(e.target.value) })}
                  aria-label="Maximum price"
                />
              </div>
            ) : null}

            {facetsActive ? (
              <button type="button" className="ella-link-underline ella-filter-clear" onClick={() => setFilters(ELLA_DEFAULT_FILTERS)}>
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="ella-empty">No pieces match this search.</p>
        ) : showGrouped ? (
          grouped.map((group) => (
            <div key={group.slug || "collection"} className="ella-section-block">
              <div className="ella-section">
                <h2 className="ella-display">{group.label}</h2>
                <div className="ella-count">
                  {group.products.length} {group.products.length === 1 ? "piece" : "pieces"}
                </div>
              </div>
              <ul className="ella-grid">{group.products.map((p, i) => renderProductCard(p, i))}</ul>
            </div>
          ))
        ) : (
          <ul className="ella-grid">{filtered.map((p, i) => renderProductCard(p, i))}</ul>
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
            {navChips.map((c) => (
              <button key={c.id} type="button" className="ella-footer-link" onClick={() => selectChip(c.id)}>
                {c.label}
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
            {whatsapp ? (
              <a className="ella-footer-link ella-footer-social" href={studioWa} target="_blank" rel="noreferrer">
                <WhatsAppGlyph /> WhatsApp
              </a>
            ) : null}
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
        {onOpenCart ? (
          <button type="button" className="ella-btn ella-cart-btn" onClick={onOpenCart}>
            <BagIcon />
            Bag ({cartCount})
          </button>
        ) : null}
        <button type="button" className="ella-btn ella-btn-outline" onClick={onOpenGeneralEnquire}>
          Enquire
        </button>
        {whatsapp ? (
          <a
            className="ella-btn ella-btn-square ella-btn-outline"
            href={studioWa}
            target="_blank"
            rel="noreferrer"
            aria-label="WhatsApp"
          >
            <WhatsAppGlyph />
          </a>
        ) : null}
      </div>
    </>
  );
}

export function EllaStorefrontSkeleton() {
  return (
    <div className="ella-store" aria-busy="true">
      <div className="ella-announce" />
      <div className="ella-site-header">
        <div className="ella-site-header-inner">
          <div className="ella-display ella-site-wordmark">{ellaCopy.wordmark}</div>
        </div>
      </div>
      <div className="ella-hero ella-hero-ph" />
      <div className="ella-skel-grid">
        {Array.from({ length: 8 }).map((_, i) => (
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
