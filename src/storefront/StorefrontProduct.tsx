import { useState } from "react";
import { formatStorefrontPrice, storefrontStockLabel } from "@/lib/storefrontStock";
import {
  productEnquiryWhatsAppText,
  publicStorefrontProductUrl,
  whatsappShareUrl,
} from "@/lib/storefrontShare";
import { storefrontHomePath } from "@/lib/storefrontPath";
import type { PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import { StorefrontFooter, StorefrontHeader } from "./StorefrontChrome";
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
  const waText = productEnquiryWhatsAppText(shop.name, product.name, productUrl);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StorefrontHeader shop={shop} />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <a href={storefrontHomePath(orgSlug)} className="text-sm font-medium text-slate-600">
          ← Back to catalogue
        </a>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="aspect-square overflow-hidden rounded-2xl bg-slate-100">
              {photo ? (
                <img src={photo} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  No photo
                </div>
              )}
            </div>
            {photos.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {photos.map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    className={`h-16 w-16 overflow-hidden rounded-lg ring-2 ${
                      i === photoIndex ? "ring-[color:var(--store-accent,#2563EB)]" : "ring-transparent"
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            {product.brand ? (
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {product.brand}
              </div>
            ) : null}
            <h1 className="mt-1 text-2xl font-semibold">{product.name}</h1>
            <div className="mt-3 flex items-center gap-3">
              <div className="text-xl font-semibold tabular-nums">
                {formatStorefrontPrice(product.display_price) || "Price on request"}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  product.stock_status === "out_of_stock"
                    ? "bg-slate-100 text-slate-500"
                    : product.stock_status === "low_stock"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {storefrontStockLabel(product.stock_status, product.stock_left)}
              </span>
            </div>

            {product.variants.length > 1 ? (
              <div className="mt-4">
                <div className="text-xs font-medium text-slate-500">Available options</div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {product.variants.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-slate-200"
                    >
                      {[v.size, v.color].filter(Boolean).join(" · ") || "Variant"}{" "}
                      <span className="text-slate-500">
                        {storefrontStockLabel(v.stock_status, v.stock_left)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {shop.whatsapp_number ? (
                <a
                  href={whatsappShareUrl(waText, shop.whatsapp_number)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  WhatsApp
                </a>
              ) : null}
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold">Enquire about this product</h2>
              <p className="mt-1 text-xs text-slate-500">
                Leave your number and the shop will get back to you.
              </p>
              <EnquiryForm slug={orgSlug} productId={product.product_id} />
            </div>
          </div>
        </div>
      </main>
      <StorefrontFooter shop={shop} />
    </div>
  );
}
