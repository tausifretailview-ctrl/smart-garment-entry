import { useState } from "react";
import { ArrowLeft, BookImage, Check, Download, Loader2, MessageCircle, Search, SlidersHorizontal, X, ZoomIn } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSettings } from "@/hooks/useSettings";
import { FIELD_SALES_SAFE_BOTTOM, FIELD_SALES_SAFE_TOP } from "@/hooks/useFieldSalesShell";
import { FieldSheet } from "@/components/fieldSales/FieldSheet";
import { ProductPhotoViewer } from "@/components/ProductPhotoViewer";
import { ProductThumb } from "@/components/ProductThumb";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  cataloguePriceLine,
  catalogueStockStatus,
  type CatalogueStockFilter,
  type CataloguePriceMode,
} from "@/lib/productCatalogue";
import { isFieldSalesCatalogueOn } from "@/lib/fieldSalesCatalogue";
import { CATALOGUE_ALL, CATALOGUE_MAX_PRODUCTS, useProductCatalogue } from "@/hooks/useProductCatalogue";

const STOCK_CHIPS: Array<{ key: CatalogueStockFilter; label: string }> = [
  { key: "in", label: "In stock" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "all", label: "All" },
];
const STOCK_BADGE = {
  in: "bg-emerald-100 text-emerald-800",
  low: "bg-amber-100 text-amber-800",
  out: "bg-red-100 text-red-700",
} as const;
const PRICE_MODES: Array<{ key: CataloguePriceMode; label: string }> = [
  { key: "sale", label: "Sale price" },
  { key: "mrp", label: "MRP" },
  { key: "both", label: "Sale price + MRP" },
  { key: "none", label: "No price" },
];

/**
 * Field Sales → Catalogue: the salesman picks products (search, brand, category, stock, with
 * photo) and sends the customer the shop's catalogue PDF on WhatsApp, or saves it. Same PDF as
 * Reports → Product Catalogue. The owner can turn it off in Settings → Sale.
 */
export default function SalesmanCatalogue() {
  const { navigate } = useOrgNavigation();
  const { data: settingsData } = useSettings();
  const enabled = isFieldSalesCatalogueOn(
    (settingsData as { sale_settings?: Record<string, unknown> } | null)?.sale_settings,
  );
  const c = useProductCatalogue();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);

  const appBar = (
    <div
      className="sticky top-0 z-20 bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-sm"
      style={{ paddingTop: FIELD_SALES_SAFE_TOP }}
    >
      <div className="flex h-14 items-center gap-1 px-1.5">
        <button
          type="button"
          onClick={() => navigate("/salesman")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold leading-tight">Product Catalogue</h1>
          <p className="truncate text-xs leading-tight text-white/80">Send customers photos, sizes and prices</p>
        </div>
        {enabled && (
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold active:bg-white/20"
            data-testid="fs-catalogue-options"
          >
            <SlidersHorizontal className="h-4 w-4" /> Options
          </button>
        )}
      </div>
    </div>
  );

  if (settingsData && !enabled) {
    return (
      <div className="flex min-h-full flex-col bg-slate-50" data-testid="fs-catalogue">
        {appBar}
        <div className="px-6 py-16 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <BookImage className="h-8 w-8" />
          </span>
          <p className="mt-3 text-[15px] font-semibold text-slate-800">Catalogue is turned off</p>
          <p className="mt-1 text-sm text-slate-500">Ask the shop to turn on Settings → Sale → Field Sales catalogue.</p>
        </div>
      </div>
    );
  }

  const select = (value: string, onChange: (v: string) => void, all: string, list: string[], testId: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"
      data-testid={testId}
    >
      <option value={CATALOGUE_ALL}>{all}</option>
      {list.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex min-h-full flex-col bg-slate-50" data-testid="fs-catalogue">
      {appBar}

      {/* Filters */}
      <div className="space-y-2 border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={c.search}
            onChange={(e) => c.setSearch(e.target.value)}
            placeholder="Search product, brand, style"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-10 text-[15px] outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            data-testid="fs-catalogue-search"
          />
          {c.search && (
            <button
              type="button"
              onClick={() => c.setSearch("")}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {select(c.brand, c.setBrand, "All brands", c.options?.brands ?? [], "fs-catalogue-brand")}
          {select(c.category, c.setCategory, "All categories", c.options?.categories ?? [], "fs-catalogue-category")}
        </div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5" role="group" aria-label="Stock filter">
          {STOCK_CHIPS.map((f) => {
            const on = c.stockFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => c.setStockFilter(f.key)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold",
                  on ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white text-slate-700",
                )}
                data-testid={`fs-catalogue-stock-${f.key}`}
              >
                {f.label}
                {c.stockCounts ? <span className="ml-1 tabular-nums opacity-80">{c.stockCounts[f.key]}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection row */}
      <div className="flex items-center gap-2 px-3 pt-2.5 text-sm">
        <span className="font-semibold text-slate-800" data-testid="fs-catalogue-count">
          {c.isFetching && !c.data ? "Loading…" : `${c.selected.length} of ${c.items.length} selected`}
        </span>
        {c.items.length > 0 && (
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={c.selectAll} className="rounded-full px-2.5 py-1 text-xs font-semibold text-orange-600 active:bg-orange-50">
              Select all
            </button>
            <button type="button" onClick={c.clearAll} className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 active:bg-slate-100">
              Clear
            </button>
          </span>
        )}
      </div>
      {c.data?.capped ? (
        <p className="px-3 pt-1 text-xs text-amber-700">
          Showing the first {CATALOGUE_MAX_PRODUCTS} products — pick a brand or category to see the rest.
        </p>
      ) : null}

      {/* Products */}
      <div className="flex-1 px-3 pb-3 pt-2">
        {c.items.length === 0 && !c.isFetching ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500" data-testid="fs-catalogue-empty">
            No products match.{" "}
            {c.onlyWithPhoto ? "Turn off “Only with photo” in Options." : c.stockFilter !== "all" ? "Try the “All” button." : ""}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5" data-testid="fs-catalogue-grid">
            {c.items.map((item) => {
              const on = !c.deselected.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => c.toggle(item.id)}
                  aria-pressed={on}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border bg-white p-2 text-left shadow-sm outline-none transition focus:outline-none focus-visible:outline-none",
                    on ? "border-orange-500 ring-2 ring-orange-500" : "border-slate-200 opacity-50 ring-0 grayscale",
                  )}
                  data-testid="fs-catalogue-card"
                >
                  <span
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm",
                      on ? "border-orange-500 bg-orange-500 text-white" : "border-white bg-white/90 text-transparent",
                    )}
                    aria-hidden
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <span
                    className={cn(
                      "absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm",
                      STOCK_BADGE[catalogueStockStatus(item.stock)],
                    )}
                  >
                    {item.stock > 0 ? `Stock ${item.stock}` : "Out"}
                  </span>
                  <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                    {item.imageUrl ? (
                      <>
                        <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-contain" />
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhoto({ url: item.imageUrl!, name: item.name });
                          }}
                          className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white active:bg-black/60"
                          aria-label={`View photo of ${item.name}`}
                          data-testid="fs-catalogue-zoom"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </span>
                      </>
                    ) : (
                      <ProductThumb url={null} size={48} />
                    )}
                  </span>
                  <span className="mt-1.5 block truncate text-[13px] font-bold leading-tight text-slate-900">{item.name}</span>
                  <span className="block truncate text-[11px] leading-tight text-slate-500">
                    {[item.brand, item.colors.slice(0, 2).join("/")].filter(Boolean).join(" · ")}
                  </span>
                  {c.showSizes && item.sizes.length > 0 && (
                    <span className="block truncate text-[11px] leading-tight text-slate-600">
                      {c.showStock ? item.sizeStock.map((s) => `${s.size}(${s.qty})`).join(" ") : item.sizes.join(", ")}
                    </span>
                  )}
                  <span className="mt-0.5 block truncate text-[13px] font-bold text-orange-700">
                    {cataloguePriceLine(item, c.priceMode)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Send bar */}
      <div
        className="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white px-3 pt-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: `calc(${FIELD_SALES_SAFE_BOTTOM} + 10px)` }}
      >
        <button
          type="button"
          onClick={() => void c.download()}
          disabled={!!c.busy || c.selected.length === 0}
          className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white text-[15px] font-semibold text-slate-800 active:bg-slate-50 disabled:opacity-50"
          data-testid="fs-catalogue-download"
        >
          {c.busy === "download" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          PDF
        </button>
        <button
          type="button"
          onClick={() => void c.share()}
          disabled={!!c.busy || c.selected.length === 0}
          className="flex h-12 flex-[1.6] items-center justify-center gap-1.5 rounded-xl bg-green-600 text-[15px] font-bold text-white shadow-md shadow-green-600/25 active:bg-green-700 disabled:opacity-50"
          data-testid="fs-catalogue-share"
        >
          {c.busy === "share" ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
          Send on WhatsApp
        </button>
      </div>

      <FieldSheet open={optionsOpen} onOpenChange={setOptionsOpen} title="Catalogue options" testId="fs-catalogue-options-sheet">
        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-700">Price on catalogue</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRICE_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={c.priceMode === m.key}
                  onClick={() => c.setPriceMode(m.key)}
                  className={cn(
                    "h-10 rounded-xl border text-sm font-semibold",
                    c.priceMode === m.key ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-300 text-slate-700",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ["Only with photo", c.onlyWithPhoto, c.setOnlyWithPhoto, "fs-catalogue-with-photo"],
              ["Show sizes", c.showSizes, c.setShowSizes, "fs-catalogue-sizes"],
              ["Size-wise stock qty in PDF", c.showStock, c.setShowStock, "fs-catalogue-size-stock"],
            ] as Array<[string, boolean, (v: boolean) => void, string]>
          ).map(([label, value, set, id]) => (
            <label key={id} className="flex items-center justify-between gap-3 text-[15px] font-medium text-slate-800">
              {label}
              <Switch id={id} checked={value} onCheckedChange={set} />
            </label>
          ))}
          <div className="space-y-1.5">
            <label htmlFor="fs-catalogue-title" className="text-sm font-semibold text-slate-700">Title on the PDF</label>
            <input
              id="fs-catalogue-title"
              value={c.title}
              onChange={(e) => c.setTitle(e.target.value)}
              className="no-uppercase h-11 w-full rounded-xl border border-slate-300 px-3 text-[15px]"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fs-catalogue-phone" className="text-sm font-semibold text-slate-700">Customer WhatsApp no. (optional)</label>
            <input
              id="fs-catalogue-phone"
              value={c.phone}
              onChange={(e) => c.setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Used when the phone cannot attach the PDF directly"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-[15px]"
            />
          </div>
          <button
            type="button"
            onClick={() => setOptionsOpen(false)}
            className="h-12 w-full rounded-xl bg-orange-500 text-[15px] font-bold text-white active:bg-orange-600"
          >
            Done
          </button>
        </div>
      </FieldSheet>

      <ProductPhotoViewer url={photo?.url} name={photo?.name} onClose={() => setPhoto(null)} />
    </div>
  );
}
