import { useMemo, useState } from "react";
import { formatStorefrontPrice, storefrontStockLabel } from "@/lib/storefrontStock";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import { storefrontProductPath } from "@/lib/storefrontPath";
import type { PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import { StorefrontShell } from "./StorefrontChrome";

export function StorefrontHome({
  shop,
  orgSlug,
  products,
}: {
  shop: PublicStorefrontShop;
  orgSlug: string;
  products: PublicStorefrontProduct[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const displayName = shop.display_name || shop.name;

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [products]);

  const filtered = products.filter((p) => {
    const matchesCat = !category || p.category === category;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const shareUrl = publicStorefrontUrl(window.location.origin, orgSlug);
  const categoryEyebrow =
    categories.length > 0 ? categories.slice(0, 3).join(" · ") : "Curated catalogue";

  return (
    <StorefrontShell shop={shop} orgSlug={orgSlug}>
      <section className="storefront-hero">
        <p className="storefront-eyebrow">{categoryEyebrow}</p>
        <h1>{displayName}</h1>
        <p>Browse our latest products and send an enquiry — we&apos;ll get back to you on WhatsApp.</p>

        <div className="storefront-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
          />
        </div>

        {categories.length > 0 ? (
          <div className="storefront-chip-row">
            <button
              type="button"
              className={`storefront-chip${!category ? " active" : ""}`}
              onClick={() => setCategory("")}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`storefront-chip${category === c ? " active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="storefront-section-label">
        <h2>Shop collection</h2>
        <span>
          {filtered.length} piece{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="storefront-empty">No products match this search.</p>
      ) : (
        <div className="storefront-grid">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} orgSlug={orgSlug} />
          ))}
        </div>
      )}

      <a
        href={whatsappShareUrl(storefrontWhatsAppShareText(displayName, shareUrl), shop.whatsapp_number)}
        target="_blank"
        rel="noreferrer"
        className="storefront-float-share"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden>
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" />
        </svg>
        Share this shop
      </a>
    </StorefrontShell>
  );
}

function ProductCard({ product, orgSlug }: { product: PublicStorefrontProduct; orgSlug: string }) {
  const outOfStock = product.stock_status === "out_of_stock";
  const badgeClass =
    product.stock_status === "out_of_stock"
      ? "out"
      : product.stock_status === "low_stock"
        ? "low"
        : "in";

  return (
    <a href={storefrontProductPath(orgSlug, product.product_id)} className="storefront-card">
      <div className="storefront-card-photo">
        <span className={`storefront-stock-badge ${badgeClass}`}>
          {storefrontStockLabel(product.stock_status, product.stock_left)}
        </span>
        {product.photo_urls[0] ? (
          <img src={product.photo_urls[0]} alt={product.name} loading="lazy" />
        ) : (
          <div className="storefront-card-photo-empty">No photo</div>
        )}
      </div>
      <div className="storefront-card-body">
        <div className="storefront-card-name">{product.name}</div>
        {product.brand ? <div className="storefront-card-meta">{product.brand}</div> : null}
        <div className="storefront-price-tag">
          <span className="storefront-price-now">
            {formatStorefrontPrice(product.display_price) || "Ask"}
          </span>
        </div>
        <span className={`storefront-enquire-btn${outOfStock ? " disabled" : ""}`}>
          {outOfStock ? "Notify shop" : "View & enquire"}
        </span>
      </div>
    </a>
  );
}
