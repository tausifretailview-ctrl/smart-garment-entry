/**
 * "Street" store theme: a bold black-and-white fashion storefront.
 *
 * Everything shown comes from the shop's own catalogue (logo, menus, sections,
 * products, photos), so any shop can pick it in Website → Theme. Bag, checkout,
 * live size stock, reward points and offer codes reuse the same modules as the
 * Ella'Noor theme; only the page around them is new.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { parseStorefrontPath, storefrontHomePath, storefrontProductPath, storefrontProductUrl } from "@/lib/storefrontPath";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import type {
  PublicStorefrontMenu,
  PublicStorefrontPayload,
  PublicStorefrontProduct,
  PublicStorefrontShop,
} from "@/lib/websiteTypes";
import { isNewArrivalSlug, type PublicStorefrontSection } from "@/lib/websiteSections";
import { EllaCartSheet } from "./EllaCartSheet";
import { addToEllaCart, ellaCartCount, ellaCartLineKey, type EllaCartLine } from "./ellaCart";
import { useLockBodyScroll } from "./ellaLockBody";
import {
  applyEllaFilters,
  ELLA_DEFAULT_FILTERS,
  ellaPriceCeiling,
  toEllaStorefrontProduct,
  type EllaSortKey,
  type EllaStorefrontProduct,
} from "./ellaProduct";
import { findSize, type EllaSizeOption } from "./ellaVariants";
import { ellaWhatsAppNumber } from "./ellaWhatsApp";
import { submitStorefrontEnquiry } from "./storefrontClient";
import { storefrontLocationLine } from "./storefrontTheme";
import {
  buildStreetBannerSlides,
  buildStreetNav,
  buildStreetTiles,
  parseStreetWishlist,
  restoreStreetCart,
  streetCardFlag,
  streetCartKey,
  streetNewArrivals,
  streetProductsFor,
  streetRelatedProducts,
  streetSizeFacets,
  streetWishlistKey,
  toggleStreetWishlist,
  type StreetBannerSlide,
  type StreetNavItem,
} from "./streetStore";
import { streetSampleCatalogue, streetSampleImage, streetSampleKind } from "./streetSamples";
import "./ella-storefront.css";
import "./street-storefront.css";

type View =
  | { kind: "home" }
  | { kind: "collection"; item: StreetNavItem | null; title: string }
  | { kind: "wishlist" }
  | { kind: "product"; product: EllaStorefrontProduct };

type ListFilters = { sizes: string[]; inStockOnly: boolean; maxPrice: number | null; sort: EllaSortKey };

const NO_FILTERS: ListFilters = { sizes: [], inStockOnly: false, maxPrice: null, sort: "featured" };
const SLIDE_MS = 5000;

const SORT_OPTIONS: Array<{ value: EllaSortKey; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

function readStorage(kind: "local" | "session", key: string): string | null {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(kind: "local" | "session", key: string, value: string): void {
  try {
    (kind === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* storage blocked — wishlist / bag just last for this visit */
  }
}

/* --- icons ---------------------------------------------------------------- */

function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className="st-icon"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Icon>
);
const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);
const HeartIcon = ({ filled = false }: { filled?: boolean }) => (
  <Icon filled={filled}>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
  </Icon>
);
const BagIcon = () => (
  <Icon>
    <path d="M5.5 8h13l-1 12h-11l-1-12Z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </Icon>
);
const HomeIcon = () => (
  <Icon>
    <path d="M4 11 12 4l8 7v9h-5.5v-5.5h-5V20H4v-9Z" />
  </Icon>
);
const GridIcon = () => (
  <Icon>
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
  </Icon>
);
const CloseIcon = () => (
  <Icon>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon>
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </Icon>
);
const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

/* --- product card --------------------------------------------------------- */

function StreetCard({
  product,
  wished,
  onOpen,
  onWish,
  onQuickAdd,
}: {
  product: EllaStorefrontProduct;
  wished: boolean;
  onOpen: (product: EllaStorefrontProduct) => void;
  onWish: (product: EllaStorefrontProduct) => void;
  onQuickAdd: (product: EllaStorefrontProduct) => void;
}) {
  const flag = streetCardFlag(product);
  const [photo, alt] = product.images;
  const sizes = product.sizes.filter((s) => s.inStock && s.label !== "FS").map((s) => s.label);
  return (
    <article className="st-card">
      <div className="st-card-media">
        <button type="button" className="st-card-open" onClick={() => onOpen(product)} aria-label={product.name}>
          {photo ? (
            <img className="st-card-img" src={photo} alt={product.name} loading="lazy" decoding="async" />
          ) : (
            <span className="st-card-empty">Photo coming soon</span>
          )}
          {alt ? <img className="st-card-img st-card-alt" src={alt} alt="" loading="lazy" decoding="async" aria-hidden="true" /> : null}
        </button>
        {flag === "new" ? <span className="st-flag st-flag-new">New</span> : null}
        {flag === "few-left" ? <span className="st-flag">Few left</span> : null}
        {flag === "sold-out" ? <span className="st-flag st-flag-out">Sold out</span> : null}
        <button
          type="button"
          className={`st-card-wish${wished ? " st-on" : ""}`}
          aria-pressed={wished}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          onClick={() => onWish(product)}
        >
          <HeartIcon filled={wished} />
        </button>
        {product.available > 0 ? (
          <button type="button" className="st-card-add" aria-label={`Quick add ${product.name}`} onClick={() => onQuickAdd(product)}>
            <PlusIcon />
          </button>
        ) : null}
      </div>
      <button type="button" className="st-card-body" onClick={() => onOpen(product)}>
        <span className="st-card-name">{product.name}</span>
        <span className="st-card-price">{product.priceLabel || "Price on request"}</span>
        {sizes.length > 0 ? <span className="st-card-sizes">{sizes.slice(0, 7).join(" · ")}</span> : null}
      </button>
    </article>
  );
}

/* --- sheets --------------------------------------------------------------- */

function StreetSheet({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useLockBodyScroll(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close" onClick={onClose} />
      <section className="ella-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              {eyebrow ? <div className="ella-eyebrow">{eyebrow}</div> : null}
              <h2 className="ella-display ella-sheet-name">{title}</h2>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          {children}
        </div>
      </section>
    </>
  );
}

function StreetEnquiryForm({
  slug,
  product,
  shopName,
  shopWhatsApp,
}: {
  slug: string;
  product: EllaStorefrontProduct | null;
  shopName: string;
  shopWhatsApp: string | null;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waText = product
    ? `Hi ${shopName}, I would like to ask about ${product.name} (${product.code})${product.priceLabel ? ` — ${product.priceLabel}` : ""}.`
    : `Hi ${shopName}, I have a question about your store.`;
  const waHref = shopWhatsApp ? whatsappShareUrl(waText, shopWhatsApp) : null;

  if (done) {
    return (
      <div className="ella-success" role="status">
        <div className="ella-display ella-success-title">Thank you</div>
        <p>{shopName} has your message and will contact you on the number you gave.</p>
        {waHref ? (
          <a className="ella-btn ella-btn-outline" href={waHref} target="_blank" rel="noreferrer">
            Also message on WhatsApp
          </a>
        ) : null}
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const composed = [product ? `[${product.code}] ${product.name}` : "", message].filter(Boolean).join(" · ");
    const checked = validateEnquiryInput({
      customerName,
      customerPhone,
      message: composed,
      productId: product?.productId,
    });
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitStorefrontEnquiry({
        slug,
        customerName: checked.value.customerName,
        customerPhone: checked.value.customerPhone,
        message: checked.value.message,
        productId: checked.value.productId,
      });
      if (!result.ok) {
        setError(result.status === 429 ? "Too many messages. Please try again later." : result.error || "Could not send");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="ella-form" onSubmit={onSubmit}>
      <label>
        <span>Name</span>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required autoComplete="name" />
      </label>
      <label>
        <span>Phone / WhatsApp</span>
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
          inputMode="tel"
          autoComplete="tel"
        />
      </label>
      <label>
        <span>Message (optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </label>
      {error ? <p className="ella-error">{error}</p> : null}
      <div className="ella-form-actions">
        <button type="submit" className="ella-btn" disabled={submitting}>
          {submitting ? "Sending" : "Send message"}
        </button>
        {waHref ? (
          <a className="ella-btn ella-btn-outline" href={waHref} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        ) : null}
      </div>
    </form>
  );
}

/* --- product page --------------------------------------------------------- */

function StreetProductPage({
  product,
  orgSlug,
  shopName,
  shopWhatsApp,
  cart,
  wished,
  related,
  wishlist,
  onBack,
  onAdd,
  onWish,
  onEnquire,
  onOpen,
  onQuickAdd,
}: {
  product: EllaStorefrontProduct;
  orgSlug: string;
  shopName: string;
  shopWhatsApp: string | null;
  cart: EllaCartLine[];
  wished: boolean;
  related: EllaStorefrontProduct[];
  wishlist: string[];
  onBack: () => void;
  onAdd: (product: EllaStorefrontProduct, size: EllaSizeOption | null, qty: number, thenCheckout: boolean) => void;
  onWish: (product: EllaStorefrontProduct) => void;
  onEnquire: (product: EllaStorefrontProduct) => void;
  onOpen: (product: EllaStorefrontProduct) => void;
  onQuickAdd: (product: EllaStorefrontProduct) => void;
}) {
  const [sizeLabel, setSizeLabel] = useState<string | null>(product.defaultSize?.label ?? null);
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState<"description" | "details" | "help" | null>("description");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSizeLabel(product.defaultSize?.label ?? null);
    setQty(1);
    setOpen("description");
    setCopied(false);
  }, [product.productId, product.defaultSize]);

  const size = useMemo(
    () => findSize(product.sizes, sizeLabel) ?? product.defaultSize,
    [product.sizes, product.defaultSize, sizeLabel],
  );
  const canBuy = Boolean(size?.inStock);
  const maxQty = size && size.availableKnown ? Math.max(1, size.available) : 5;
  const inBag = cart.find((line) => line.key === ellaCartLineKey(product.productId, size?.label ?? null))?.qty ?? 0;
  const anyInStock = product.sizes.some((s) => s.inStock);
  const oneSize = product.sizes.length === 1 && product.sizes[0].label === "FS";

  useEffect(() => {
    setQty((current) => Math.min(Math.max(1, current), maxQty));
  }, [maxQty]);

  const url = storefrontProductUrl(orgSlug, product.productId);
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: `${product.name} — ${shopName}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* share sheet closed or clipboard blocked */
    }
  };
  const waHref = shopWhatsApp
    ? whatsappShareUrl(`Hi ${shopName}, I would like to ask about ${product.name} (${product.code}). ${url}`, shopWhatsApp)
    : null;

  const stockLine = !anyInStock
    ? "Sold out online right now"
    : !canBuy
      ? "Sold out in this size"
      : size?.low
        ? `Only ${size.available} left${oneSize ? "" : ` in ${size.label}`}`
        : "In stock";

  const section = (id: "description" | "details" | "help", title: string, body: ReactNode) => (
    <div className="st-acc">
      <button type="button" className="st-acc-head" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
        <span>{title}</span>
        <span aria-hidden="true">{open === id ? "–" : "+"}</span>
      </button>
      {open === id ? <div className="st-acc-body">{body}</div> : null}
    </div>
  );

  return (
    <div className="st-pdp-wrap">
      <button type="button" className="st-back" onClick={onBack}>
        ← Back
      </button>
      <div className="st-pdp">
        <div className={`st-gallery${product.images.length > 1 ? " st-gallery-multi" : ""}`}>
          {product.images.length > 0 ? (
            product.images.slice(0, 6).map((src, i) => (
              <div className="st-gallery-item" key={src}>
                <img src={src} alt={i === 0 ? product.name : ""} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              </div>
            ))
          ) : (
            <div className="st-gallery-item st-gallery-empty">Photo coming soon</div>
          )}
        </div>

        <div className="st-pdp-info">
          {product.sectionLabel || product.sourceCategory ? (
            <span className="st-eyebrow">{product.sectionLabel || product.sourceCategory}</span>
          ) : null}
          <h1 className="st-pdp-name">{product.name}</h1>
          <div className="st-pdp-price">{product.priceLabel || "Price on request"}</div>

          {!oneSize ? (
            <>
              <div className="st-pdp-label">Select size</div>
              <div className="st-sizes" role="group" aria-label="Select size">
                {product.sizes.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`st-size${option.label === size?.label ? " st-on" : ""}${option.inStock ? "" : " st-out"}`}
                    aria-pressed={option.label === size?.label}
                    disabled={!option.inStock}
                    onClick={() => setSizeLabel(option.label)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className={`st-stock${canBuy && !size?.low ? "" : " st-stock-warn"}`}>{stockLine}</div>

          {canBuy ? (
            <div className="st-qty" aria-label="Quantity">
              <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Less" disabled={qty <= 1}>
                −
              </button>
              <span>{qty}</span>
              <button type="button" onClick={() => setQty((n) => Math.min(maxQty, n + 1))} aria-label="More" disabled={qty >= maxQty}>
                +
              </button>
            </div>
          ) : null}

          <div className="st-pdp-actions">
            {canBuy ? (
              <>
                <button type="button" className="st-btn st-btn-solid" onClick={() => onAdd(product, size, qty, false)}>
                  {inBag > 0 ? `Add to bag · ${inBag} in bag` : "Add to bag"}
                </button>
                <button type="button" className="st-btn" onClick={() => onAdd(product, size, qty, true)}>
                  Buy now
                </button>
              </>
            ) : (
              <button type="button" className="st-btn st-btn-solid" onClick={() => onEnquire(product)}>
                Ask the shop about this style
              </button>
            )}
            <button
              type="button"
              className={`st-btn st-btn-icon${wished ? " st-on" : ""}`}
              aria-pressed={wished}
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
              onClick={() => onWish(product)}
            >
              <HeartIcon filled={wished} />
            </button>
          </div>

          <div className="st-pdp-links">
            <button type="button" className="st-link" onClick={share}>
              {copied ? "Link copied" : "Share"}
            </button>
            {waHref ? (
              <a className="st-link" href={waHref} target="_blank" rel="noreferrer">
                Ask on WhatsApp
              </a>
            ) : null}
          </div>

          {product.description ? section("description", "Description", <p>{product.description}</p>) : null}
          {section(
            "details",
            "Product details",
            <dl className="st-spec">
              <dt>Style code</dt>
              <dd>{product.code}</dd>
              {product.sourceCategory ? (
                <>
                  <dt>Category</dt>
                  <dd>{product.sourceCategory}</dd>
                </>
              ) : null}
              {!oneSize ? (
                <>
                  <dt>Sizes in stock</dt>
                  <dd>{product.sizes.filter((s) => s.inStock).map((s) => s.label).join(", ") || "None right now"}</dd>
                </>
              ) : null}
            </dl>,
          )}
          {section(
            "help",
            "Need help?",
            <p>
              Stock shown here is live from the shop.{" "}
              <button type="button" className="st-link" onClick={() => onEnquire(product)}>
                Send {shopName} a message
              </button>{" "}
              about size, delivery or returns.
            </p>,
          )}
        </div>
      </div>

      {related.length > 0 ? (
        <section className="st-section">
          <div className="st-section-head">
            <h2 className="st-h2">You may also like</h2>
          </div>
          <div className="st-rail">
            {related.map((p) => (
              <StreetCard
                key={p.productId}
                product={p}
                wished={wishlist.includes(p.productId)}
                onOpen={onOpen}
                onWish={onWish}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* --- root ----------------------------------------------------------------- */

export function StreetStorefront({
  shop,
  orgSlug,
  products,
  sections = [],
  menus = [],
  initialProductId,
  banners = [],
}: {
  shop: PublicStorefrontShop;
  orgSlug: string;
  /** Banner images from Website → Theme; empty shows the sample banners. */
  banners?: PublicStorefrontPayload["banners"];
  products: PublicStorefrontProduct[];
  sections?: PublicStorefrontSection[];
  menus?: PublicStorefrontMenu[];
  initialProductId: string | null;
}) {
  // A store with nothing published shows a sample catalogue so the theme can be seen working.
  const sampleMode = products.length === 0;
  const items = useMemo(
    () =>
      (sampleMode ? streetSampleCatalogue() : products).map((raw) => {
        const product = toEllaStorefrontProduct(raw);
        // No photo yet: a drawn sample picture (captioned as such) instead of an empty box.
        return product.images.length > 0
          ? product
          : {
              ...product,
              images: [streetSampleImage(streetSampleKind(product.name, product.sourceCategory), product.productId)],
            };
      }),
    [products, sampleMode],
  );
  const findById = useCallback(
    (id: string | null) => (id ? items.find((p) => p.productId === id || p.id === id) || null : null),
    [items],
  );
  const nav = useMemo(() => buildStreetNav(menus, sections, items), [menus, sections, items]);
  const tiles = useMemo(() => buildStreetTiles(nav, items), [nav, items]);
  const slides = useMemo(() => buildStreetBannerSlides(banners || [], nav, items), [banners, nav, items]);
  const newArrivals = useMemo(() => streetNewArrivals(items), [items]);

  const [view, setView] = useState<View>(() => {
    const first = findById(initialProductId);
    return first ? { kind: "product", product: first } : { kind: "home" };
  });
  const listViewRef = useRef<View>({ kind: "home" });
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [slide, setSlide] = useState(0);
  const [cart, setCart] = useState<EllaCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<EllaStorefrontProduct | null>(null);
  const [enquiry, setEnquiry] = useState<{ product: EllaStorefrontProduct | null } | null>(null);
  const [wishlist, setWishlist] = useState<string[]>(() => parseStreetWishlist(readStorage("local", streetWishlistKey(orgSlug))));
  const [toast, setToast] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(() => window.innerWidth);
  const cartRestoredRef = useRef(false);
  const touchXRef = useRef(0);

  const shopName = shop.display_name || shop.name;
  const shopWa = ellaWhatsAppNumber(shop.whatsapp_number) || null;
  const cartCount = ellaCartCount(cart);

  /* bag survives a reload; re-checked against live stock once the catalogue is in */
  useEffect(() => {
    if (cartRestoredRef.current || items.length === 0) return;
    cartRestoredRef.current = true;
    const saved = restoreStreetCart(readStorage("session", streetCartKey(orgSlug)), items);
    if (saved.length > 0) setCart(saved);
  }, [items, orgSlug]);

  useEffect(() => {
    if (!cartRestoredRef.current) return;
    writeStorage("session", streetCartKey(orgSlug), JSON.stringify(cart));
  }, [cart, orgSlug]);

  useEffect(() => {
    writeStorage("local", streetWishlistKey(orgSlug), JSON.stringify(wishlist));
  }, [wishlist, orgSlug]);

  /* a background catalogue refresh must not leave a stale product on the page */
  useEffect(() => {
    setView((current) => {
      if (current.kind !== "product") return current;
      const fresh = findById(current.product.productId);
      return fresh ? { kind: "product", product: fresh } : { kind: "home" };
    });
  }, [findById]);

  useEffect(() => {
    const onResize = () => setPageWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const locked = menuOpen || searchOpen || filtersOpen;
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, searchOpen, filtersOpen]);

  useEffect(() => {
    if (view.kind !== "home" || slides.length < 2 || menuOpen || searchOpen) return;
    const id = window.setInterval(() => setSlide((n) => (n + 1) % slides.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [view.kind, slides.length, menuOpen, searchOpen]);

  const closeOverlays = () => {
    setMenuOpen(false);
    setSearchOpen(false);
    setFiltersOpen(false);
    setQuickAdd(null);
  };

  const goList = useCallback(
    (next: View) => {
      listViewRef.current = next;
      setView(next);
      setFilters(NO_FILTERS);
      setMenuOpen(false);
      setSearchOpen(false);
      setFiltersOpen(false);
      setQuickAdd(null);
      if (parseStorefrontPath(window.location.pathname)?.productId) {
        window.history.pushState({}, "", storefrontHomePath(orgSlug));
      }
      window.scrollTo({ top: 0 });
    },
    [orgSlug],
  );

  const goHome = () => goList({ kind: "home" });
  const goCollection = (item: StreetNavItem | null, title?: string) =>
    goList({ kind: "collection", item, title: title || item?.label || "All products" });

  const openProduct = (product: EllaStorefrontProduct) => {
    closeOverlays();
    setView({ kind: "product", product });
    window.history.pushState({ streetProduct: product.productId }, "", storefrontProductPath(orgSlug, product.productId));
    window.scrollTo({ top: 0 });
  };

  const backFromProduct = () => {
    setView(listViewRef.current);
    window.history.pushState({}, "", storefrontHomePath(orgSlug));
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onPop = () => {
      const parsed = parseStorefrontPath(window.location.pathname);
      const product = findById(parsed?.productId || null);
      setView(product ? { kind: "product", product } : listViewRef.current);
      setCartOpen(false);
      setEnquiry(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [findById]);

  const toggleWish = (product: EllaStorefrontProduct) => {
    setToast(wishlist.includes(product.productId) ? "Removed from wishlist" : "Saved to wishlist");
    setWishlist((list) => toggleStreetWishlist(list, product.productId));
  };

  const addToBag = (product: EllaStorefrontProduct, size: EllaSizeOption | null, qty: number, thenCheckout: boolean) => {
    if (sampleMode) {
      setQuickAdd(null);
      setToast("Sample product — not for sale");
      return;
    }
    if (!size?.inStock) return;
    setCart((current) => addToEllaCart(current, product, size, qty));
    setQuickAdd(null);
    if (thenCheckout) setCartOpen(true);
    else setToast(`Added to bag${size.label !== "FS" ? ` · ${size.label}` : ""}`);
  };

  const startQuickAdd = (product: EllaStorefrontProduct) => {
    const buyable = product.sizes.filter((s) => s.inStock);
    if (buyable.length === 1) addToBag(product, buyable[0], 1, false);
    else setQuickAdd(product);
  };

  const cardProps = { onOpen: openProduct, onWish: toggleWish, onQuickAdd: startQuickAdd };
  const card = (p: EllaStorefrontProduct) => (
    <StreetCard key={p.productId} product={p} wished={wishlist.includes(p.productId)} {...cardProps} />
  );

  /* collection ------------------------------------------------------------- */
  const collectionBase = useMemo(
    () => (view.kind === "collection" ? streetProductsFor(items, view.item) : []),
    [items, view],
  );
  const collectionSort: EllaSortKey =
    view.kind === "collection" && filters.sort === "featured" && view.item ? view.item.sort : filters.sort;
  const collection = useMemo(
    () =>
      applyEllaFilters(collectionBase, {
        ...ELLA_DEFAULT_FILTERS,
        sizes: filters.sizes,
        inStockOnly: filters.inStockOnly,
        maxPrice: filters.maxPrice,
        sort: collectionSort,
      }),
    [collectionBase, filters, collectionSort],
  );
  const sizeFacets = useMemo(() => streetSizeFacets(collectionBase), [collectionBase]);
  const priceCeiling = useMemo(() => ellaPriceCeiling(collectionBase), [collectionBase]);
  const activeFilterCount = filters.sizes.length + (filters.inStockOnly ? 1 : 0) + (filters.maxPrice != null ? 1 : 0);

  const searchResults = useMemo(() => {
    const q = query.trim();
    return q ? applyEllaFilters(items, { ...ELLA_DEFAULT_FILTERS, search: q }) : [];
  }, [items, query]);

  const wished = useMemo(
    () => wishlist.map((id) => items.find((p) => p.productId === id)).filter((p): p is EllaStorefrontProduct => Boolean(p)),
    [wishlist, items],
  );

  const location = storefrontLocationLine(shop.address);
  const announcements = [
    "New styles added regularly",
    "Sizes and stock shown live from the store",
    shop.upi_id ? "Order online · pay by UPI" : null,
    shopWa ? "Questions? Chat with us on WhatsApp" : null,
    location ? `Visit us · ${location}` : null,
  ].filter((line): line is string => Boolean(line));

  const onHeroTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchXRef.current = e.touches[0].clientX;
  };
  const onHeroTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    if (Math.abs(dx) < 40 || slides.length < 2) return;
    setSlide((n) => (n + (dx < 0 ? 1 : slides.length - 1)) % slides.length);
  };

  // The header keeps the logo centred, so only as many links as fit on the left are shown;
  // the rest sit under "More".
  const navRoom = pageWidth >= 1700 ? 5 : pageWidth >= 1200 ? 4 : 3;
  const navShown = nav.length > navRoom ? nav.slice(0, navRoom - 1) : nav;
  const navMore = nav.slice(navShown.length);

  // When every listed product is a new arrival, one grid says it; a rail above would repeat it.
  const allAreNew = items.length > 0 && newArrivals.length >= items.length;
  // On wide screens the 2nd and 3rd sample banners also sit side by side further down.
  const promos = slides.filter((s) => s.kind === "sample").slice(1, 3);
  const openBanner = (s: StreetBannerSlide) =>
    goCollection(s.target, s.target?.label || "All products");

  // The New Arrival link already has its own rail above.
  const railsFor = nav
    .filter((item) => !item.chips.every((chip) => isNewArrivalSlug(chip)))
    .map((item) => ({ item, list: streetProductsFor(items, item) }))
    .filter((r) => r.list.length > 0)
    .slice(0, 3);

  const filterPanel = (
    <div className="st-filter-panel">
      <label className="st-check">
        <input
          type="checkbox"
          checked={filters.inStockOnly}
          onChange={(e) => setFilters((f) => ({ ...f, inStockOnly: e.target.checked }))}
        />
        <span>In stock only</span>
      </label>
      {sizeFacets.length > 1 ? (
        <div>
          <div className="st-pdp-label">Size</div>
          <div className="st-sizes">
            {sizeFacets.map((label) => {
              const on = filters.sizes.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  className={`st-size${on ? " st-on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      sizes: on ? f.sizes.filter((s) => s !== label) : [...f.sizes, label],
                    }))
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {priceCeiling > 500 ? (
        <div>
          <div className="st-pdp-label">
            Price up to {filters.maxPrice != null ? `₹${filters.maxPrice.toLocaleString("en-IN")}` : "any"}
          </div>
          <input
            className="st-range"
            type="range"
            min={500}
            max={priceCeiling}
            step={100}
            value={filters.maxPrice ?? priceCeiling}
            aria-label="Maximum price"
            onChange={(e) => {
              const value = Number(e.target.value);
              setFilters((f) => ({ ...f, maxPrice: value >= priceCeiling ? null : value }));
            }}
          />
        </div>
      ) : null}
      {activeFilterCount > 0 ? (
        <button type="button" className="st-link" onClick={() => setFilters((f) => ({ ...NO_FILTERS, sort: f.sort }))}>
          Clear filters
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="ella-store street-store">
      <div className="st-announce" aria-hidden="true">
        <div className="st-marquee">
          {[0, 1].map((copy) => (
            <span className="st-marquee-group" key={copy}>
              {announcements.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <header className="st-header">
        <div className="st-header-row">
          <div className="st-header-left">
            <button type="button" className="st-iconbtn st-menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
              <MenuIcon />
            </button>
            <nav className="st-nav" aria-label="Shop">
              <div className="st-nav-item">
                <button type="button" className={`st-nav-link${view.kind === "home" ? " st-on" : ""}`} onClick={goHome}>
                  Home
                </button>
              </div>
              {navShown.map((item) => (
                <div className="st-nav-item" key={item.id}>
                  <button type="button" className="st-nav-link" onClick={() => goCollection(item)}>
                    {item.label}
                  </button>
                  {item.children.length > 0 ? (
                    <div className="st-nav-drop">
                      {item.children.map((child) => (
                        <button key={child.id} type="button" className="st-nav-sub" onClick={() => goCollection(child)}>
                          {child.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {navMore.length > 0 ? (
                <div className="st-nav-item">
                  <button type="button" className="st-nav-link" aria-haspopup="true">
                    More
                  </button>
                  <div className="st-nav-drop">
                    {navMore.map((item) => (
                      <button key={item.id} type="button" className="st-nav-sub" onClick={() => goCollection(item)}>
                        {item.label}
                      </button>
                    ))}
                    <button type="button" className="st-nav-sub" onClick={() => goCollection(null, "All products")}>
                      All products
                    </button>
                  </div>
                </div>
              ) : (
                <div className="st-nav-item">
                  <button type="button" className="st-nav-link" onClick={() => goCollection(null, "All products")}>
                    All products
                  </button>
                </div>
              )}
            </nav>
          </div>
          <button type="button" className="st-brand" onClick={goHome} aria-label={`${shopName} home`}>
            {shop.logo_url ? <img className="st-brand-logo" src={shop.logo_url} alt={shopName} /> : <span>{shopName}</span>}
          </button>
          <div className="st-header-right">
            <button type="button" className="st-iconbtn" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <SearchIcon />
            </button>
            <button type="button" className="st-iconbtn st-hide-phone" aria-label="Wishlist" onClick={() => goList({ kind: "wishlist" })}>
              <HeartIcon />
              {wished.length > 0 ? <span className="st-count">{wished.length}</span> : null}
            </button>
            <button type="button" className="st-iconbtn" aria-label="Bag" onClick={() => setCartOpen(true)}>
              <BagIcon />
              {cartCount > 0 ? <span className="st-count">{cartCount}</span> : null}
            </button>
          </div>
        </div>
      </header>

      {sampleMode ? (
        <div className="st-sample-note" role="note">
          Sample catalogue · this store is being set up. Its own products will appear here soon.
        </div>
      ) : null}

      <main className="st-main">
        {view.kind === "home" ? (
          <>
            {slides.length > 0 ? (
              <div
                className={`st-hero${slides[0].kind === "image" ? " st-hero-images" : ""}`}
                onTouchStart={onHeroTouchStart}
                onTouchEnd={onHeroTouchEnd}
              >
                {slides.map((s, i) => {
                  const on = i === slide % slides.length;
                  const worded = Boolean(s.title || s.sub);
                  return (
                    <div
                      className={`st-slide st-slide-${s.kind} st-tone-${s.tone}${s.image ? "" : " st-slide-noimg"}${on ? " st-on" : ""}`}
                      key={s.id}
                      aria-hidden={!on}
                    >
                      {s.image ? (
                        <img className="st-slide-photo" src={s.image} alt="" loading={i === 0 ? "eager" : "lazy"} />
                      ) : null}
                      {worded ? <span className="st-slide-shade" /> : null}
                      <div className="st-slide-inner">
                        {worded ? (
                          <div className="st-slide-copy">
                            {s.kicker ? <span className="st-slide-kicker">{s.kicker}</span> : null}
                            {s.title ? <span className="st-slide-title">{s.title}</span> : null}
                            {s.sub ? <span className="st-slide-sub">{s.sub}</span> : null}
                            <button type="button" className="st-btn st-btn-light" tabIndex={on ? 0 : -1} onClick={() => openBanner(s)}>
                              {s.cta} <ArrowIcon />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="st-slide-hit"
                            tabIndex={on ? 0 : -1}
                            aria-label={`Open ${s.target?.label || "all products"}`}
                            onClick={() => openBanner(s)}
                          />
                        )}
                        {s.kind === "sample" && s.photos.length > 0 ? (
                          <div className={`st-collage st-collage-${s.photos.length}`} aria-hidden="true">
                            {s.photos.map((src) => (
                              <span className="st-collage-frame" key={src}>
                                <img src={src} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {slides.length > 1 ? (
                  <div className="st-dots">
                    {slides.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`st-dot${i === slide % slides.length ? " st-on" : ""}`}
                        aria-label={`Show banner ${i + 1}`}
                        onClick={() => setSlide(i)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {tiles.length > 1 ? (
              <section className="st-section">
                <div className="st-section-head">
                  <h2 className="st-h2">Shop by category</h2>
                </div>
                <div className="st-tiles">
                  {tiles.map((tile) => (
                    <button key={tile.item.id} type="button" className="st-tile" onClick={() => goCollection(tile.item)}>
                      {tile.photo ? <img src={tile.photo} alt="" loading="lazy" decoding="async" /> : null}
                      <span className="st-tile-label">
                        {tile.item.label}
                        <small>{tile.count} {tile.count === 1 ? "style" : "styles"}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {newArrivals.length > 0 && !allAreNew ? (
              <section className="st-section">
                <div className="st-section-head">
                  <h2 className="st-h2">New arrivals</h2>
                  <button type="button" className="st-link" onClick={() => goCollection(null, "All products")}>
                    View all
                  </button>
                </div>
                <div className="st-rail">{newArrivals.map(card)}</div>
              </section>
            ) : null}

            {promos.length === 2 ? (
              <section className="st-section st-duo">
                {promos.map((s) => (
                  <button key={s.id} type="button" className={`st-promo st-tone-${s.tone}`} onClick={() => openBanner(s)}>
                    <span className="st-promo-copy">
                      <span className="st-slide-kicker">{s.kicker}</span>
                      <span className="st-promo-title">{s.title}</span>
                      <span className="st-link">{s.cta}</span>
                    </span>
                    {s.photos[0] ? (
                      <span className="st-collage-frame">
                        <img src={s.photos[0]} alt="" loading="lazy" decoding="async" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </section>
            ) : null}

            {railsFor.map(({ item, list }) => (
              <section className="st-section" key={item.id}>
                <div className="st-section-head">
                  <h2 className="st-h2">{item.label}</h2>
                  <button type="button" className="st-link" onClick={() => goCollection(item)}>
                    View all
                  </button>
                </div>
                <div className="st-rail">{list.slice(0, 10).map(card)}</div>
              </section>
            ))}

            <section className="st-section">
              <div className="st-section-head">
                <h2 className="st-h2">{allAreNew ? "New arrivals" : "All products"}</h2>
                <button type="button" className="st-link" onClick={() => goCollection(null, "All products")}>
                  View all {items.length}
                </button>
              </div>
              {items.length > 0 ? (
                <div className="st-grid">{items.slice(0, 8).map(card)}</div>
              ) : (
                <p className="st-empty">Products will appear here once the shop publishes them.</p>
              )}
            </section>
          </>
        ) : null}

        {view.kind === "collection" ? (
          <section className="st-section st-collection">
            <div className="st-crumbs">
              <button type="button" className="st-link" onClick={goHome}>
                Home
              </button>
              <span>/</span>
              <span>{view.title}</span>
            </div>
            <h1 className="st-h1">{view.title}</h1>
            <div className="st-toolbar">
              <span className="st-toolbar-count">
                {collection.length} {collection.length === 1 ? "style" : "styles"}
              </span>
              <button type="button" className="st-btn st-btn-sm st-filter-btn" onClick={() => setFiltersOpen(true)}>
                Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              </button>
              <label className="st-sort">
                <span>Sort</span>
                <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as EllaSortKey }))}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="st-collection-body">
              <aside className="st-filter-rail" aria-label="Filters">
                {filterPanel}
              </aside>
              {collection.length > 0 ? (
                <div className="st-grid">{collection.map(card)}</div>
              ) : (
                <p className="st-empty">Nothing matches these filters right now.</p>
              )}
            </div>
          </section>
        ) : null}

        {view.kind === "wishlist" ? (
          <section className="st-section st-collection">
            <h1 className="st-h1">Wishlist</h1>
            {wished.length > 0 ? (
              <div className="st-grid">{wished.map(card)}</div>
            ) : (
              <p className="st-empty">
                Tap the heart on any style to save it here.{" "}
                <button type="button" className="st-link" onClick={() => goCollection(null, "All products")}>
                  Browse all products
                </button>
              </p>
            )}
          </section>
        ) : null}

        {view.kind === "product" ? (
          <StreetProductPage
            product={view.product}
            orgSlug={orgSlug}
            shopName={shopName}
            shopWhatsApp={shopWa}
            cart={cart}
            wished={wishlist.includes(view.product.productId)}
            wishlist={wishlist}
            related={streetRelatedProducts(items, view.product)}
            onBack={backFromProduct}
            onAdd={addToBag}
            onWish={toggleWish}
            onEnquire={(product) => setEnquiry({ product: sampleMode ? null : product })}
            onOpen={openProduct}
            onQuickAdd={startQuickAdd}
          />
        ) : null}
      </main>

      <footer className="st-footer">
        <div className="st-footer-grid">
          <div>
            <div className="st-footer-brand">{shopName}</div>
            {shop.address ? <p>{shop.address}</p> : null}
          </div>
          <div>
            <div className="st-footer-head">Shop</div>
            <button type="button" className="st-footer-link" onClick={() => goCollection(null, "All products")}>
              All products
            </button>
            {nav.slice(0, 6).map((item) => (
              <button key={item.id} type="button" className="st-footer-link" onClick={() => goCollection(item)}>
                {item.label}
              </button>
            ))}
          </div>
          <div>
            <div className="st-footer-head">Help</div>
            <button type="button" className="st-footer-link" onClick={() => setEnquiry({ product: null })}>
              Contact us
            </button>
            {shopWa ? (
              <a className="st-footer-link" href={whatsappShareUrl(`Hi ${shopName}`, shopWa)} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
            {shop.instagram_url ? (
              <a className="st-footer-link" href={shop.instagram_url} target="_blank" rel="noreferrer">
                Instagram
              </a>
            ) : null}
            {shop.facebook_url ? (
              <a className="st-footer-link" href={shop.facebook_url} target="_blank" rel="noreferrer">
                Facebook
              </a>
            ) : null}
          </div>
        </div>
        <div className="st-footer-base">
          © {new Date().getFullYear()} {shopName} · Stock synced live from Ezzy ERP
        </div>
      </footer>

      <nav className="st-tabbar" aria-label="Store">
        <button type="button" className={view.kind === "home" ? "st-on" : ""} onClick={goHome}>
          <HomeIcon />
          <span>Home</span>
        </button>
        <button type="button" className={view.kind === "collection" ? "st-on" : ""} onClick={() => setMenuOpen(true)}>
          <GridIcon />
          <span>Shop</span>
        </button>
        <button type="button" onClick={() => setSearchOpen(true)}>
          <SearchIcon />
          <span>Search</span>
        </button>
        <button type="button" className={view.kind === "wishlist" ? "st-on" : ""} onClick={() => goList({ kind: "wishlist" })}>
          <HeartIcon />
          {wished.length > 0 ? <span className="st-count">{wished.length}</span> : null}
          <span>Wishlist</span>
        </button>
        <button type="button" onClick={() => setCartOpen(true)}>
          <BagIcon />
          {cartCount > 0 ? <span className="st-count">{cartCount}</span> : null}
          <span>Bag</span>
        </button>
      </nav>

      {menuOpen ? (
        <div className="st-overlay" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="st-overlay-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="st-drawer">
            <div className="st-drawer-head">
              <span className="st-h2">Shop</span>
              <button type="button" className="st-iconbtn" aria-label="Close" onClick={() => setMenuOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="st-drawer-body">
              <button type="button" className="st-drawer-link" onClick={goHome}>
                Home
              </button>
              <button type="button" className="st-drawer-link" onClick={() => goCollection(null, "All products")}>
                All products
              </button>
              {nav.map((item) =>
                item.children.length > 0 ? (
                  <div key={item.id}>
                    <button
                      type="button"
                      className="st-drawer-link"
                      aria-expanded={openGroup === item.id}
                      onClick={() => setOpenGroup(openGroup === item.id ? null : item.id)}
                    >
                      {item.label}
                      <span aria-hidden="true">{openGroup === item.id ? "–" : "+"}</span>
                    </button>
                    {openGroup === item.id ? (
                      <div className="st-drawer-sub">
                        <button type="button" onClick={() => goCollection(item)}>
                          All {item.label}
                        </button>
                        {item.children.map((child) => (
                          <button key={child.id} type="button" onClick={() => goCollection(child)}>
                            {child.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button key={item.id} type="button" className="st-drawer-link" onClick={() => goCollection(item)}>
                    {item.label}
                  </button>
                ),
              )}
              <button type="button" className="st-drawer-link" onClick={() => goList({ kind: "wishlist" })}>
                Wishlist{wished.length > 0 ? ` (${wished.length})` : ""}
              </button>
              <button
                type="button"
                className="st-drawer-link"
                onClick={() => {
                  setMenuOpen(false);
                  setEnquiry({ product: null });
                }}
              >
                Contact us
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="st-overlay st-search" role="dialog" aria-modal="true" aria-label="Search">
          <div className="st-search-head">
            <SearchIcon />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search styles, categories, codes"
              aria-label="Search the store"
            />
            <button type="button" className="st-iconbtn" aria-label="Close search" onClick={() => setSearchOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <div className="st-search-body">
            {query.trim() ? (
              searchResults.length > 0 ? (
                <div className="st-grid">{searchResults.slice(0, 24).map(card)}</div>
              ) : (
                <p className="st-empty">No styles match “{query.trim()}”.</p>
              )
            ) : (
              <div className="st-chips">
                {nav.slice(0, 10).map((item) => (
                  <button key={item.id} type="button" className="st-chip" onClick={() => goCollection(item)}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="st-overlay" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" className="st-overlay-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          <div className="st-drawer st-drawer-right">
            <div className="st-drawer-head">
              <span className="st-h2">Filter</span>
              <button type="button" className="st-iconbtn" aria-label="Close" onClick={() => setFiltersOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="st-drawer-body">{filterPanel}</div>
            <button type="button" className="st-btn st-btn-solid st-drawer-cta" onClick={() => setFiltersOpen(false)}>
              Show {collection.length} {collection.length === 1 ? "style" : "styles"}
            </button>
          </div>
        </div>
      ) : null}

      {quickAdd ? (
        <StreetSheet title={quickAdd.name} eyebrow={quickAdd.priceLabel || undefined} onClose={() => setQuickAdd(null)}>
          <div className="st-pdp-label">Select size to add</div>
          <div className="st-sizes">
            {quickAdd.sizes.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`st-size${option.inStock ? "" : " st-out"}`}
                disabled={!option.inStock}
                onClick={() => addToBag(quickAdd, option, 1, false)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="st-link st-quick-more" onClick={() => openProduct(quickAdd)}>
            View full details
          </button>
        </StreetSheet>
      ) : null}

      {enquiry ? (
        <StreetSheet
          title={enquiry.product ? enquiry.product.name : "Contact us"}
          eyebrow={enquiry.product ? "Ask the shop" : shopName}
          onClose={() => setEnquiry(null)}
        >
          <StreetEnquiryForm slug={orgSlug} product={enquiry.product} shopName={shopName} shopWhatsApp={shopWa} />
        </StreetSheet>
      ) : null}

      {cartOpen ? (
        <EllaCartSheet
          slug={orgSlug}
          shopName={shopName}
          shopWhatsApp={shopWa}
          upiId={shop.upi_id}
          upiBusinessName={shop.upi_business_name || shopName}
          cart={cart}
          onCartChange={setCart}
          onClose={() => setCartOpen(false)}
        />
      ) : null}

      {toast ? (
        <div className="st-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export function StreetStorefrontSkeleton() {
  return (
    <div className="ella-store street-store" aria-busy="true" aria-label="Loading store">
      <div className="st-announce" />
      <div className="st-header">
        <div className="st-header-row" />
      </div>
      <div className="st-skel st-skel-hero" />
      <div className="st-section">
        <div className="st-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="st-skel st-skel-card" key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
