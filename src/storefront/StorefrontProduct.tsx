import { useState } from "react";
import { formatStorefrontPrice, storefrontStockLabel } from "@/lib/storefrontStock";
import {
  productEnquiryWhatsAppText,
  publicStorefrontProductUrl,
  whatsappShareUrl,
} from "@/lib/storefrontShare";
import { storefrontHomePath } from "@/lib/storefrontPath";
import type { PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import { StorefrontShell } from "./StorefrontChrome";
import { EnquiryForm } from "./EnquiryForm";

export function StorefrontProduct({
  shop,
  orgSlug,
  product,
}: {
  shop: PublicStorefrontShop;
  orgSlug: string;
  product: PublicStorefrontProduct;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = product.photo_urls.length > 0 ? product.photo_urls : [];
  const photo = photos[photoIndex] || photos[0];
  const productUrl = publicStorefrontProductUrl(window.location.origin, orgSlug, product.product_id);
  const waText = productEnquiryWhatsAppText(shop.display_name || shop.name, product.name, productUrl);
  const badgeClass =
    product.stock_status === "out_of_stock"
      ? "out"
      : product.stock_status === "low_stock"
        ? "low"
        : "in";

  return (
    <StorefrontShell shop={shop} orgSlug={orgSlug}>
      <main className="storefront-product-main">
        <a href={storefrontHomePath(orgSlug)} className="storefront-back-link">
          ← Back to catalogue
        </a>

        <div className="storefront-product-layout">
        <div className="storefront-product-media">
        <div className="storefront-product-gallery">
          {photo ? (
            <img src={photo} alt={product.name} />
          ) : (
            <div className="storefront-card-photo-empty h-full">No photo</div>
          )}
        </div>

        {photos.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {photos.map((url, i) => (
              <button
                key={url + i}
                type="button"
                onClick={() => setPhotoIndex(i)}
                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2"
                style={{ borderColor: i === photoIndex ? "var(--store-accent)" : "transparent" }}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        </div>

        <div className="storefront-product-info">
        {product.brand ? (
          <p className="storefront-eyebrow mt-4 mb-0">{product.brand}</p>
        ) : null}
        <h1 className="storefront-product-title">{product.name}</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="storefront-price-tag">
            <span className="storefront-price-now">
              {formatStorefrontPrice(product.display_price) || "Price on request"}
            </span>
          </div>
          <span className={`storefront-stock-badge ${badgeClass}`}>
            {storefrontStockLabel(product.stock_status, product.stock_left)}
          </span>
        </div>

        {product.variants.length > 1 ? (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--store-muted)]">
              Available options
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <li
                  key={v.id}
                  className="rounded-full border border-[color:var(--store-line)] bg-[color:var(--store-ivory)] px-3 py-1 text-xs"
                >
                  {[v.size, v.color].filter(Boolean).join(" · ") || "Variant"}{" "}
                  <span className="text-[color:var(--store-muted)]">
                    {storefrontStockLabel(v.stock_status, v.stock_left)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {shop.whatsapp_number ? (
          <div className="mt-5 flex gap-2">
            <a href={whatsappShareUrl(waText, shop.whatsapp_number)} target="_blank" rel="noreferrer" className="storefront-btn-wa">
              WhatsApp
            </a>
          </div>
        ) : null}

        <div className="storefront-enquiry-panel">
          <h2>Enquire about this product</h2>
          <p className="text-xs text-[color:var(--store-muted)] mb-4">
            {product.name}
            {product.display_price != null
              ? ` · ${formatStorefrontPrice(product.display_price)}`
              : ""}
          </p>
          <EnquiryForm
            slug={orgSlug}
            productId={product.product_id}
            shopWhatsApp={shop.whatsapp_number}
            productLabel={product.name}
          />
        </div>
        </div>
        </div>
      </main>
    </StorefrontShell>
  );
}
