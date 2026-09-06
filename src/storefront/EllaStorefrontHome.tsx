import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { storefrontHomePath } from "@/lib/storefrontPath";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import { isNewArrivalSlug, type PublicStorefrontSection } from "@/lib/websiteSections";
import { ellaCopy } from "./storefrontTheme";
import { ellaStockBadgeClass } from "./ellaStock";
import {
  applyEllaFilters,
  ellaPriceCeiling,
  ELLA_DEFAULT_FILTERS,
  sortEllaProducts,
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

/** Luxury header nav from the Ella'Noor HTML mock — maps onto existing chips. */
const LUXURY_NAV: Array<{
  id: string;
  label: string;
  chip: string;
  title: string;
  lead: string;
}> = [
  {
    id: "new-in",
    label: "New in",
    chip: "all",
    title: "New in",
    lead: "The latest studio drop — chikankari and prints just in from the rack.",
  },
  {
    id: "ready",
    label: "Ready to wear",
    chip: "Ready",
    title: "Ready to wear",
    lead: "Chikankari and printed kurtas held in studio stock — dispatched within 48 hours.",
  },
  {
    id: "formals",
    label: "Formals",
    chip: "Festive",
    title: "Formals",
    lead: "Occasion pieces cut to your measurements in 3–4 weeks.",
  },
  {
    id: "mto",
    label: "Made to order",
    chip: "Bridal",
    title: "Made to order",
    lead: "Formals and bridals stitched to your measurements. Pay 30% to start; the balance before dispatch.",
  },
  {
    id: "sale",
    label: "Sale",
    chip: "all",
    title: "Sale",
    lead: "Selected studio pieces while they last.",
  },
];

const TRUST = [
  { title: "Live studio stock", body: "Quantities come straight from Ezzy ERP — no overselling." },
  { title: "48-hour dispatch", body: "Ready-to-wear leaves the studio in two working days." },
  { title: "Made to order", body: "Formals cut to your measurements in 3–4 weeks." },
  { title: "COD & UPI", body: "COD up to ₹10,000, verified UPI on everything else." },
] as const;

const MTO_STEPS = [
  { n: "01", title: "Reserve the style", body: "Pay 30% advance to hold your slot in the cutting queue." },
  { n: "02", title: "Share measurements", body: "On WhatsApp or from your saved profile — confirmed in 2 days." },
  { n: "03", title: "Stitching & QC", body: "Two weeks of stitching, three days of finishing and checks." },
  { n: "04", title: "Balance & dispatch", body: "Pay the balance, we ship with tracking in week four." },
] as const;

const HELP_LINKS = ["Size guide", "Shipping & COD", "Exchange policy", "Track my order"] as const;

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
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" />
    </svg>
  );
}

function cardBadge(product: EllaStorefrontProduct) {
  if (product.stock.state === "out" || product.madeToOrder) {
    return { label: "Made to order", className: "ella-badge ella-badge-out" };
  }
  return { label: product.stock.label, className: ellaStockBadgeClass(product.stock.state) };
}

type SiteView = "home" | "collection";
type Availability = "all" | "in-stock" | "made-to-order";

export function EllaStorefrontHome({
  shopName,
  orgSlug,
  whatsapp,
  address,
  instagramUrl,
  facebookUrl,
  products,
  sections = [],
  cartCount = 0,
  onOpenProduct,
  onOpenGeneralEnquire,
  onOpenCart,
  onNavigate,
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
  onNavigate?: () => void;
}) {
  const [view, setView] = useState<SiteView>("home");
  const [filters, setFilters] = useState<EllaFilterState>(ELLA_DEFAULT_FILTERS);
  const [luxuryNav, setLuxuryNav] = useState("");
  const [availability, setAvailability] = useState<Availability>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [joined, setJoined] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const collectionRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const chrome = chromeRef.current;
    const store = chrome?.closest(".ella-store") as HTMLElement | null;
    if (!chrome || !store) return;
    const apply = () => {
      store.style.setProperty("--ella-chrome-h", `${chrome.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(chrome);
    return () => {
      observer.disconnect();
      store.style.removeProperty("--ella-chrome-h");
    };
  }, []);

  const sizeFacets = useMemo(() => catalogueSizeFacets(products), [products]);
  const priceCeiling = useMemo(() => ellaPriceCeiling(products), [products]);
  const filtered = useMemo(() => {
    let list = applyEllaFilters(products, filters);
    if (availability === "in-stock") list = list.filter((p) => p.available > 0);
    if (availability === "made-to-order") list = list.filter((p) => p.available <= 0);
    return list;
  }, [products, filters, availability]);

  const arrivals = useMemo(() => {
    const arrivalSlugs = new Set(sections.filter((s) => isNewArrivalSlug(s.slug)).map((s) => s.slug));
    const fromSection = products.filter(
      (p) => isNewArrivalSlug(p.sectionSlug) || (p.sectionSlug && arrivalSlugs.has(p.sectionSlug)),
    );
    const pool = fromSection.length > 0 ? fromSection : sortEllaProducts(products, "newest");
    return pool.slice(0, 6);
  }, [products, sections]);

  const inStockCount = useMemo(() => products.filter((p) => p.available > 0).length, [products]);
  const mtoCount = useMemo(() => products.filter((p) => p.available <= 0).length, [products]);
  const hero = products.find((p) => p.images[0])?.images[0] || "";
  const shareUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  const studioWa = whatsappShareUrl(storefrontWhatsAppShareText(shopName, shareUrl), whatsapp);
  const visitLine = (address || "").trim() || ellaCopy.address;
  const homeHref = storefrontHomePath(orgSlug);
  const activeNav = LUXURY_NAV.find((item) => item.id === luxuryNav) || LUXURY_NAV[1];

  const searchHits = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (!q) return products.filter((p) => p.images[0]).slice(0, 3);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.fabric.toLowerCase().includes(q),
      )
      .slice(0, 3);
  }, [products, filters.search]);

  const suggestions = useMemo(() => {
    const fabrics = Array.from(
      new Set(products.map((p) => p.fabric.split(/[·,]/)[0]?.trim()).filter(Boolean)),
    ).slice(0, 2);
    return [
      { label: "chikankari kurta", count: `${products.filter((p) => /chikan|kurta/i.test(p.name)).length || products.length} styles` },
      ...fabrics.map((fabric) => ({
        label: fabric.toLowerCase(),
        count: `${products.filter((p) => p.fabric.toLowerCase().includes(fabric.toLowerCase())).length} styles`,
      })),
      { label: "in stock now", count: `${inStockCount} styles` },
    ].slice(0, 4);
  }, [products, inStockCount]);

  const tiles = useMemo(() => {
    const first = (pred: (p: EllaStorefrontProduct) => boolean) =>
      products.find((p) => pred(p) && p.images[0])?.images[0] || hero;
    return [
      {
        id: "ready",
        label: "Ready to wear",
        meta: `${inStockCount} in stock`,
        image: first((p) => p.available > 0 && p.category === "Ready"),
      },
      {
        id: "formals",
        label: "Formals",
        meta: "Made to order",
        image: first((p) => p.category === "Festive" || p.category === "Bridal"),
      },
      {
        id: "new-in",
        label: "Everyday prints",
        meta: "New drop",
        image: first((p) => /print|block|cotton|mul/i.test(`${p.name} ${p.fabric}`)),
      },
    ];
  }, [products, hero, inStockCount]);

  const facetsActive =
    availability !== "all" || filters.sizes.length > 0 || filters.maxPrice != null || Boolean(filters.search.trim());

  const patch = (next: Partial<EllaFilterState>) => setFilters((prev) => ({ ...prev, ...next }));

  const goHome = () => {
    onNavigate?.();
    setView("home");
    setLuxuryNav("");
    setAvailability("all");
    setFilters(ELLA_DEFAULT_FILTERS);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goCollection = (item: (typeof LUXURY_NAV)[number], extras: Partial<EllaFilterState> = {}) => {
    onNavigate?.();
    setLuxuryNav(item.id);
    setView("collection");
    setAvailability(item.id === "mto" ? "made-to-order" : item.id === "ready" ? "in-stock" : "all");
    setFilters({
      ...ELLA_DEFAULT_FILTERS,
      chip: item.chip,
      sort: item.id === "new-in" ? "newest" : "featured",
      ...extras,
    });
    window.setTimeout(() => collectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const primaryNav = LUXURY_NAV.filter((item) => item.id !== "sale");
  const saleNav = LUXURY_NAV.find((item) => item.id === "sale");

  const selectLuxury = (item: (typeof LUXURY_NAV)[number]) => goCollection(item);

  const toggleSize = (label: string) =>
    patch({
      sizes: filters.sizes.includes(label)
        ? filters.sizes.filter((s) => s !== label)
        : [...filters.sizes, label],
    });

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };

  const clearFacets = () => {
    setAvailability("all");
    setFilters((prev) => ({ ...ELLA_DEFAULT_FILTERS, chip: prev.chip, sort: prev.sort }));
  };

  const renderProductCard = (product: EllaStorefrontProduct, index: number, variant: "home" | "collection") => {
    const wished = wishlist.includes(product.id);
    const badge = cardBadge(product);
    const titleIsCode = product.name.trim().toUpperCase() === product.code.trim().toUpperCase();
    const homeMeta = titleIsCode ? product.fabric : `${product.code} · ${product.fabric}`;
    return (
      <li key={product.id}>
        <div className={`ella-card${variant === "collection" ? " ella-card-collection" : ""}`}>
          <button
            type="button"
            className="ella-card-img"
            onClick={() => onOpenProduct(product)}
            aria-label={`${product.name}${product.priceLabel ? ` — ${product.priceLabel}` : ""}`}
          >
            {product.images[0] ? (
              <img
                src={product.images[0]}
                alt={product.name}
                loading={index < 4 ? "eager" : "lazy"}
                decoding="async"
              />
            ) : null}
            <span className={badge.className}>{badge.label}</span>
          </button>
          {variant === "home" ? (
            <div className="ella-card-body">
              <div className="ella-card-title-row">
                <button type="button" className="ella-display ella-card-name" onClick={() => onOpenProduct(product)}>
                  {product.name}
                </button>
                <button
                  type="button"
                  className={`ella-wish-btn${wished ? " ella-wish-btn-on" : ""}`}
                  aria-pressed={wished}
                  aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                  onClick={() => toggleWishlist(product.id)}
                >
                  <HeartIcon filled={wished} />
                </button>
              </div>
              <div className="ella-eyebrow ella-card-code">{homeMeta}</div>
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
          ) : (
            <div className="ella-card-body">
              <button type="button" className="ella-display ella-card-name" onClick={() => onOpenProduct(product)}>
                {product.name}
              </button>
              {titleIsCode ? null : <div className="ella-eyebrow ella-card-code">{product.code}</div>}
              {product.priceLabel ? <div className="ella-price">{product.priceLabel}</div> : null}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="ella-chrome" ref={chromeRef}>
      <div className="ella-announce">
        <span>Free shipping on prepaid orders across India</span>
        <span aria-hidden>·</span>
        <span>COD up to ₹10,000</span>
        <span aria-hidden>·</span>
        <span>Made-to-order in 3–4 weeks</span>
      </div>

      <header className="ella-site-header">
        <div className="ella-site-header-inner">
          <a
            className="ella-site-brand"
            href={homeHref}
            onClick={(e) => {
              e.preventDefault();
              goHome();
            }}
          >
            <span className="ella-brand-stack">
              <span className="ella-display ella-site-wordmark">{ellaCopy.wordmark}</span>
              <span className="ella-site-tagline">{ellaCopy.designer}</span>
            </span>
          </a>

          <nav className="ella-site-nav" aria-label="Collections">
            <div className="ella-nav-primary">
              {primaryNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ella-nav-link${view === "collection" && luxuryNav === item.id ? " ella-nav-link-active" : ""}`}
                  onClick={() => selectLuxury(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {saleNav ? (
              <div className="ella-nav-sale">
                <button
                  type="button"
                  className={`ella-nav-link${view === "collection" && luxuryNav === saleNav.id ? " ella-nav-link-active" : ""}`}
                  onClick={() => selectLuxury(saleNav)}
                >
                  {saleNav.label}
                </button>
              </div>
            ) : null}
          </nav>

          <div className="ella-site-tools">
            <button
              type="button"
              className="ella-icon-btn"
              aria-label="Search styles"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((v) => !v);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              className="ella-icon-btn"
              aria-label="Wishlist"
              onClick={() => goCollection(LUXURY_NAV[0], { sort: "newest" })}
            >
              <HeartIcon />
            </button>
            <button type="button" className="ella-icon-btn" aria-label="Account" onClick={onOpenGeneralEnquire}>
              <AccountIcon />
            </button>
            {onOpenCart ? (
              <button type="button" className="ella-header-btn ella-header-btn-bag" onClick={onOpenCart}>
                <BagIcon />
                <span>Bag ( {cartCount} )</span>
              </button>
            ) : null}
          </div>
        </div>

        {searchOpen ? (
          <div className="ella-search-drawer">
            <div className="ella-page">
              <div className="ella-search-wrap">
                <span className="ella-search-icon" aria-hidden>
                  <SearchIcon />
                </span>
                <input
                  ref={searchRef}
                  className="ella-search"
                  value={filters.search}
                  onChange={(e) => {
                    patch({ search: e.target.value });
                    if (e.target.value.trim()) {
                      onNavigate?.();
                      setView("collection");
                    }
                  }}
                  placeholder="Search by style code, colour or fabric"
                  aria-label="Search styles"
                />
                <button type="button" className="ella-search-close" onClick={() => setSearchOpen(false)}>
                  Close
                </button>
              </div>
              <div className="ella-search-panels">
                <div>
                  <div className="ella-search-kicker">Suggestions</div>
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      className="ella-search-suggest"
                      onClick={() => {
                        onNavigate?.();
                        patch({ search: s.label });
                        setView("collection");
                        setSearchOpen(false);
                      }}
                    >
                      <span>{s.label}</span>
                      <span>{s.count}</span>
                    </button>
                  ))}
                </div>
                <div className="ella-search-hits">
                  <div className="ella-search-kicker">Popular styles</div>
                  <div className="ella-search-hit-grid">
                    {searchHits.map((p) => (
                      <button key={p.id} type="button" className="ella-search-hit" onClick={() => onOpenProduct(p)}>
                        {p.images[0] ? <img src={p.images[0]} alt="" /> : <span className="ella-search-hit-ph" />}
                        <span>
                          <span className="ella-search-hit-name">{p.name}</span>
                          <span className="ella-search-hit-code">{p.code}</span>
                          {p.priceLabel ? <span className="ella-search-hit-price">{p.priceLabel}</span> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </header>
      </div>
      <div className="ella-chrome-spacer" aria-hidden="true" />

      {view === "home" ? (
        <>
          <section className="ella-hero ella-frame">
            {hero ? <img src={hero} alt={`${shopName} collection`} decoding="async" /> : <div className="ella-hero-ph" />}
            <div className="ella-hero-veil" />
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
            <div className="ella-hero-copy">
              <div className="ella-eyebrow ella-hero-kicker">Autumn edit · 2026</div>
              <h1 className="ella-display ella-hero-title">Everyday chikankari, festive formals</h1>
              <p className="ella-hero-lead">
                Ready-to-wear pieces ship in 48 hours from live studio stock. Formals are cut to order in 3–4 weeks.
              </p>
              <div className="ella-hero-actions">
                <button type="button" className="ella-btn ella-hero-btn" onClick={() => goCollection(LUXURY_NAV[1])}>
                  Shop ready to wear
                </button>
                <button
                  type="button"
                  className="ella-btn ella-btn-ghost-light ella-hero-btn"
                  onClick={() => goCollection(LUXURY_NAV[3])}
                >
                  Made to order
                </button>
              </div>
              <div className="ella-hero-trust">
                <span className="ella-hero-live">
                  <span className="ella-live-dot" />
                  Live stock from Ezzy ERP
                </span>
                <span aria-hidden>·</span>
                <span>Free prepaid shipping</span>
                <span aria-hidden>·</span>
                <span>7-day exchange</span>
              </div>
            </div>
          </section>

          <section className="ella-page ella-assure-wrap">
            <div className="ella-assure-strip">
              {TRUST.map((item) => (
                <div key={item.title}>
                  <div className="ella-display ella-assure-strip-title">{item.title}</div>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="ella-page ella-arrivals">
            <div className="ella-arrivals-head">
              <div>
                <div className="ella-eyebrow ella-arrivals-kicker">In stock now</div>
                <h2 className="ella-display ella-arrivals-title">New arrivals</h2>
              </div>
              <button type="button" className="ella-view-all" onClick={() => goCollection(LUXURY_NAV[0])}>
                View all {products.length} styles
              </button>
            </div>
            {arrivals.length === 0 ? (
              <p className="ella-empty">No pieces in the studio yet.</p>
            ) : (
              <ul className="ella-grid ella-grid-home">{arrivals.map((p, i) => renderProductCard(p, i, "home"))}</ul>
            )}
          </section>

          <section className="ella-page ella-tiles">
            <div className="ella-tile-grid">
              {tiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className="ella-tile"
                  onClick={() => goCollection(LUXURY_NAV.find((n) => n.id === tile.id) || LUXURY_NAV[0])}
                >
                  {tile.image ? <img src={tile.image} alt="" /> : <span className="ella-tile-ph" />}
                  <span className="ella-tile-veil" />
                  <span className="ella-tile-copy">
                    <span className="ella-display ella-tile-label">{tile.label}</span>
                    <span className="ella-tile-meta">{tile.meta}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="ella-page ella-mto">
            <div className="ella-mto-panel">
              <div>
                <div className="ella-eyebrow">Made to order</div>
                <h2 className="ella-display ella-mto-title">Cut for you, in four steps</h2>
                <p>
                  Formals and bridals are stitched to your measurements. Pay 30% to start; the balance before dispatch.
                  Every stage is tracked in your order page.
                </p>
              </div>
              <div>
                {MTO_STEPS.map((step) => (
                  <div key={step.n} className="ella-mto-step">
                    <div className="ella-mto-n">{step.n}</div>
                    <div>
                      <div className="ella-display ella-mto-step-title">{step.title}</div>
                      <div className="ella-mto-step-body">{step.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section ref={collectionRef} className="ella-collection-page" id="collection">
          <div className="ella-page ella-crumb">
            <button type="button" onClick={goHome}>
              Home
            </button>
            <span aria-hidden>/</span>
            <span>{activeNav.title}</span>
          </div>
          <div className="ella-page ella-collection-intro">
            <h1 className="ella-display ella-collection-heading">{activeNav.title}</h1>
            <p>{activeNav.lead}</p>
          </div>
          <div className="ella-page ella-collection-layout">
            <aside className="ella-filter-rail">
              <div className="ella-filter-rail-head">
                <span className="ella-display">Filter</span>
                {facetsActive ? (
                  <button type="button" className="ella-filter-clear-link" onClick={clearFacets}>
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="ella-filter-rail-block">
                <div className="ella-filter-label">Availability</div>
                <label className="ella-check">
                  <input
                    type="checkbox"
                    checked={availability === "in-stock"}
                    onChange={() => setAvailability(availability === "in-stock" ? "all" : "in-stock")}
                  />
                  <span>In stock now</span>
                  <span className="ella-filter-count">{inStockCount}</span>
                </label>
                <label className="ella-check">
                  <input
                    type="checkbox"
                    checked={availability === "made-to-order"}
                    onChange={() => setAvailability(availability === "made-to-order" ? "all" : "made-to-order")}
                  />
                  <span>Made to order</span>
                  <span className="ella-filter-count">{mtoCount}</span>
                </label>
              </div>
              {sizeFacets.length > 0 ? (
                <div className="ella-filter-rail-block">
                  <div className="ella-filter-label">Size</div>
                  {sizeFacets.map((facet) => (
                    <label key={facet.label} className="ella-check">
                      <input
                        type="checkbox"
                        checked={filters.sizes.includes(facet.label)}
                        onChange={() => toggleSize(facet.label)}
                      />
                      <span>{facet.label}</span>
                      <span className="ella-filter-count">{facet.count}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {priceCeiling > 0 ? (
                <div className="ella-filter-rail-block">
                  <div className="ella-filter-label">Price</div>
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
                  <div className="ella-range-meta">
                    <span>₹500</span>
                    <span>₹{(filters.maxPrice ?? priceCeiling).toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ) : null}
            </aside>

            <div className="ella-collection-main">
              <div className="ella-toolbar">
                <div className="ella-toolbar-left">
                  <span className="ella-count">
                    {filtered.length} {filtered.length === 1 ? "style" : "styles"}
                  </span>
                  {availability === "in-stock" ? (
                    <button type="button" className="ella-facet-pill" onClick={() => setAvailability("all")}>
                      In stock only <span aria-hidden>×</span>
                    </button>
                  ) : null}
                  {availability === "made-to-order" ? (
                    <button type="button" className="ella-facet-pill" onClick={() => setAvailability("all")}>
                      Made to order <span aria-hidden>×</span>
                    </button>
                  ) : null}
                  {filters.sizes.map((size) => (
                    <button key={size} type="button" className="ella-facet-pill" onClick={() => toggleSize(size)}>
                      Size {size} <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
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
              {filtered.length === 0 ? (
                <p className="ella-empty">No pieces match this search.</p>
              ) : (
                <ul className="ella-grid">{filtered.map((p, i) => renderProductCard(p, i, "collection"))}</ul>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="ella-site-footer">
        <div className="ella-site-footer-inner">
          <div className="ella-footer-brand">
            <div className="ella-display ella-footer-heading">{ellaCopy.wordmark}</div>
            <p className="ella-footer-copy">
              Studio-made ethnic wear. Stock and orders run live on Ezzy ERP, so what you see in the store is what is on
              the rack.
            </p>
            <form
              className="ella-newsletter"
              onSubmit={(e) => {
                e.preventDefault();
                if (newsletterEmail.trim()) setJoined(true);
              }}
            >
              <input
                type="email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="Your email"
                aria-label="Email"
                disabled={joined}
              />
              <button type="submit" disabled={joined}>
                {joined ? "Joined" : "Join"}
              </button>
            </form>
          </div>
          <div className="ella-footer-col">
            <div className="ella-footer-label">Shop</div>
            {LUXURY_NAV.map((item) => (
              <button key={item.id} type="button" className="ella-footer-link" onClick={() => selectLuxury(item)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="ella-footer-col">
            <div className="ella-footer-label">Help</div>
            {HELP_LINKS.map((label) => (
              <button key={label} type="button" className="ella-footer-link" onClick={onOpenGeneralEnquire}>
                {label}
              </button>
            ))}
            {whatsapp ? (
              <a className="ella-footer-link ella-footer-social" href={studioWa} target="_blank" rel="noreferrer">
                WhatsApp us
              </a>
            ) : null}
          </div>
          <div className="ella-footer-col">
            <div className="ella-footer-label">Studio</div>
            <p className="ella-footer-copy">{visitLine}</p>
            <p className="ella-footer-copy">{ellaCopy.hours}</p>
            {instagramUrl ? (
              <a
                className="ella-footer-link ella-footer-social"
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
              >
                <InstagramIcon /> Instagram
              </a>
            ) : null}
            {facebookUrl ? (
              <a className="ella-footer-link ella-footer-social" href={facebookUrl} target="_blank" rel="noreferrer">
                <FacebookIcon /> Facebook
              </a>
            ) : null}
            {whatsapp ? (
              <a className="ella-footer-link ella-footer-social" href={studioWa} target="_blank" rel="noreferrer">
                <WhatsAppGlyph /> WhatsApp
              </a>
            ) : null}
          </div>
        </div>
        <div className="ella-footer-legal">
          <span>© {new Date().getFullYear()} Ella'Noor · Powered by Ezzy ERP</span>
          <span>UPI · Cards · Netbanking · COD</span>
        </div>
      </footer>

      <div className="ella-action-bar">
        {onOpenCart ? (
          <button type="button" className="ella-btn ella-btn-ink ella-cart-btn" onClick={onOpenCart}>
            <BagIcon />
            Bag ( {cartCount} )
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
      <div className="ella-chrome">
        <div className="ella-announce" />
        <div className="ella-site-header">
          <div className="ella-site-header-inner">
            <div className="ella-brand-stack">
              <div className="ella-display ella-site-wordmark">{ellaCopy.wordmark}</div>
              <div className="ella-site-tagline">{ellaCopy.designer}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="ella-chrome-spacer" aria-hidden="true" />
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
