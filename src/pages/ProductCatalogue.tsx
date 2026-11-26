import { BookImage, Download, Loader2, MessageCircle, Search, Share2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ProductThumb } from "@/components/ProductThumb";
import {
  cataloguePriceLine,
  catalogueStockStatus,
  CATALOGUE_LOW_STOCK,
  type CatalogueStockFilter,
  type CataloguePriceMode,
} from "@/lib/productCatalogue";
import { CATALOGUE_ALL as ALL, CATALOGUE_MAX_PRODUCTS as MAX_PRODUCTS, useProductCatalogue } from "@/hooks/useProductCatalogue";

const STOCK_FILTERS: Array<{ key: CatalogueStockFilter; label: string; hint: string }> = [
  { key: "in", label: "In stock", hint: "Quantity more than 0" },
  { key: "low", label: "Low stock", hint: `${CATALOGUE_LOW_STOCK} pieces or fewer` },
  { key: "out", label: "Out of stock", hint: "Quantity 0" },
  { key: "all", label: "All", hint: "Every product" },
];

const STOCK_BADGE = {
  in: "bg-emerald-100 text-emerald-800",
  low: "bg-amber-100 text-amber-800",
  out: "bg-red-100 text-red-700",
} as const;

/**
 * Product Catalogue — pick products (brand / category / search, stock filter, with photo) and send
 * the customer an A4 PDF with photo, sizes in stock and price: WhatsApp / share / download.
 * Data and sending live in useProductCatalogue (also used by the Field Sales app).
 */
export default function ProductCatalogue() {
  const {
    search, setSearch, brand, setBrand, category, setCategory, stockFilter, setStockFilter,
    onlyWithPhoto, setOnlyWithPhoto, showSizes, setShowSizes, showStock, setShowStock,
    priceMode, setPriceMode, title, setTitle, phone, setPhone, deselected, toggle, selectAll, clearAll,
    busy, options, data, isFetching, items, selected, stockCounts, download, share,
  } = useProductCatalogue();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BackToDashboard />
        <h1 className="flex items-center gap-2 text-xl font-bold text-teal-800">
          <BookImage className="h-5 w-5" />
          Product Catalogue
        </h1>
        <span className="text-sm text-muted-foreground">Send customers a PDF with photos, sizes and prices</span>
      </div>

      <Card className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="catalogue-search">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="catalogue-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product, brand, category, style"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Brand</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger data-testid="catalogue-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All brands</SelectItem>
              {(options?.brands ?? []).map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(options?.categories ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Price on catalogue</Label>
          <Select value={priceMode} onValueChange={(v) => setPriceMode(v as CataloguePriceMode)}>
            <SelectTrigger data-testid="catalogue-price"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sale">Sale price</SelectItem>
              <SelectItem value="mrp">MRP</SelectItem>
              <SelectItem value="both">Sale price + MRP</SelectItem>
              <SelectItem value="none">No price</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-4">
          <span className="text-sm font-medium">Stock</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stock filter">
            {STOCK_FILTERS.map((f) => {
              const on = stockFilter === f.key;
              return (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  aria-pressed={on}
                  title={f.hint}
                  onClick={() => setStockFilter(f.key)}
                  className={on ? "bg-teal-700 text-white hover:bg-teal-800" : ""}
                  data-testid={`catalogue-stock-${f.key}`}
                >
                  {f.label}
                  {stockCounts ? <span className="ml-1.5 tabular-nums opacity-80">{stockCounts[f.key]}</span> : null}
                </Button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-2 xl:col-span-4">
          {[
            ["Only with photo", onlyWithPhoto, setOnlyWithPhoto, "catalogue-with-photo"],
            ["Show sizes", showSizes, setShowSizes, "catalogue-sizes"],
            ["Size-wise qty (and stock in PDF)", showStock, setShowStock, "catalogue-stock"],
          ].map(([label, value, set, id]) => (
            <label key={id as string} className="flex items-center gap-2 text-sm">
              <Switch id={id as string} checked={value as boolean} onCheckedChange={set as (v: boolean) => void} />
              {label as string}
            </label>
          ))}
          <div className="flex items-center gap-2">
            <Label htmlFor="catalogue-title" className="text-sm">Title</Label>
            <Input id="catalogue-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 w-48" />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold" data-testid="catalogue-count">
          {isFetching && !data ? "Loading…" : `${selected.length} of ${items.length} products selected`}
        </span>
        {data?.capped ? (
          <span className="text-xs text-amber-700" data-testid="catalogue-capped">
            Showing the first {MAX_PRODUCTS} products — narrow by brand, category or search to see the rest.
          </span>
        ) : null}
        {items.length > 0 && (
          <>
            <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Customer WhatsApp no. (optional)"
            className="h-9 w-56"
            inputMode="tel"
          />
          <Button variant="outline" onClick={() => void download()} disabled={!!busy || selected.length === 0} data-testid="catalogue-download">
            {busy === "download" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Download PDF
          </Button>
          <Button
            onClick={() => void share()}
            disabled={!!busy || selected.length === 0}
            className="bg-green-600 text-white hover:bg-green-700"
            data-testid="catalogue-share"
          >
            {busy === "share" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 className="mr-1.5 h-4 w-4" /> : <MessageCircle className="mr-1.5 h-4 w-4" />}
            Send to customer
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && !isFetching ? (
          <p className="py-10 text-center text-sm text-muted-foreground" data-testid="catalogue-empty">
            No products match.{" "}
            {onlyWithPhoto
              ? "Turn off “Only with photo” or add photos in Product Dashboard."
              : stockFilter !== "all"
                ? "Try the “All” stock button."
                : ""}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6" data-testid="catalogue-grid">
            {items.map((item) => {
              const on = !deselected.has(item.id);
              const price = cataloguePriceLine(item, priceMode);
              return (
                <Card
                  key={item.id}
                  className={`relative cursor-pointer overflow-hidden p-2 transition ${on ? "ring-2 ring-teal-600" : "opacity-60"}`}
                  onClick={() => toggle(item.id)}
                  data-testid="catalogue-card"
                >
                  <Checkbox checked={on} className="absolute left-3 top-3 z-10 bg-white" aria-label={`Include ${item.name}`} />
                  {/* Stock in hand, on the photo corner: always on screen, in the PDF only when switched on. */}
                  <span
                    className={`absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm ${STOCK_BADGE[catalogueStockStatus(item.stock)]}`}
                    data-testid="catalogue-card-stock"
                  >
                    {item.stock > 0 ? `Stock ${item.stock}` : "Out of stock"}
                  </span>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <ProductThumb url={null} size={56} />
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-bold">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.brand, item.category, item.colors.slice(0, 3).join("/")].filter(Boolean).join(" · ")}
                  </p>
                  {showSizes && item.sizes.length > 0 && (
                    <p className="truncate text-xs" title={item.sizeStock.map((s) => `${s.size}: ${s.qty}`).join(", ")}>
                      Sizes:{" "}
                      {showStock ? item.sizeStock.map((s) => `${s.size} (${s.qty})`).join(", ") : item.sizes.join(", ")}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-sm font-bold text-teal-800">{price}</p>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
