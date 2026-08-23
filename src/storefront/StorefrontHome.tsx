import { useMemo, useState } from "react";
import { formatStorefrontPrice, storefrontStockLabel } from "@/lib/storefrontStock";
import { publicStorefrontUrl, storefrontWhatsAppShareText, whatsappShareUrl } from "@/lib/storefrontShare";
import { storefrontProductPath } from "@/lib/storefrontPath";
import type { PublicStorefrontProduct, PublicStorefrontShop } from "@/lib/websiteTypes";
import { StorefrontFooter, StorefrontHeader } from "./StorefrontChrome";

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StorefrontHeader shop={shop} />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{shop.name}</h1>
            <p className="mt-1 text-sm text-slate-500">Browse in-stock products and send an enquiry.</p>
          </div>
          <a
            href={whatsappShareUrl(storefrontWhatsAppShareText(shop.name, shareUrl), shop.whatsapp_number)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--store-accent,#2563EB)] px-4 py-2 text-sm font-medium text-white"
          >
            Share on WhatsApp
          </a>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[color:var(--store-accent,#2563EB)]"
          />
        </div>

        {categories.length > 0 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <Chip active={!category} onClick={() => setCategory("")} label="All" />
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)} label={c} />
            ))}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="mt-12 text-center text-sm text-slate-500">No products match this search.</p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((product) => (
              <li key={product.id}>
                <a
                  href={storefrontProductPath(orgSlug, product.product_id)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm"
                >
                  <div className="aspect-square bg-slate-100">
                    {product.photo_urls[0] ? (
                      <img
                        src={product.photo_urls[0]}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 text-sm font-semibold">{product.name}</div>
                    {product.brand ? (
                      <div className="text-xs text-slate-500">{product.brand}</div>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatStorefrontPrice(product.display_price) || "Ask"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
      <StorefrontFooter shop={shop} />
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
