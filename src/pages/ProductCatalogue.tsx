import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookImage, Download, Loader2, MessageCircle, Search, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ProductThumb } from "@/components/ProductThumb";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";
import { fetchProductImageMap } from "@/lib/productImages";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import {
  buildCatalogueItems,
  buildProductCataloguePdf,
  cataloguePriceLine,
  type CatalogueProduct,
  type CatalogueVariant,
  type CataloguePriceMode,
} from "@/lib/productCatalogue";

const MAX_PRODUCTS = 600;
const MAX_IN_PDF = 240;
const ALL = "__all__";

/**
 * Product Catalogue — pick products (brand / category / search, in stock, with photo) and send
 * the customer an A4 PDF with photo, sizes in stock and price: WhatsApp / share / download.
 */
export default function ProductCatalogue() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: settings } = useSettings();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [brand, setBrand] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(true);
  const [showSizes, setShowSizes] = useState(true);
  const [showStock, setShowStock] = useState(false);
  const [priceMode, setPriceMode] = useState<CataloguePriceMode>("sale");
  const [title, setTitle] = useState("Product Catalogue");
  const [phone, setPhone] = useState("");
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"" | "download" | "share">("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  // Brand / category choices (names only).
  const { data: options } = useQuery({
    queryKey: ["catalogue-options", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("brand, category")
        .eq("organization_id", orgId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      const brands = [...new Set((data ?? []).map((r) => (r.brand || "").trim()).filter(Boolean))].sort();
      const categories = [...new Set((data ?? []).map((r) => (r.category || "").trim()).filter(Boolean))].sort();
      return { brands, categories };
    },
  });

  const { data, isFetching } = useQuery({
    queryKey: ["catalogue-products", orgId, debounced, brand, category],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, product_name, brand, category, style, color, image_url, default_sale_price")
        .eq("organization_id", orgId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .neq("product_type", "service")
        .order("product_name")
        .limit(MAX_PRODUCTS);
      if (brand !== ALL) q = q.eq("brand", brand);
      if (category !== ALL) q = q.eq("category", category);
      if (debounced) {
        const t = debounced.replace(/[%,()]/g, " ");
        q = q.or(`product_name.ilike.%${t}%,brand.ilike.%${t}%,category.ilike.%${t}%,style.ilike.%${t}%`);
      }
      const { data: products, error } = await q;
      if (error) throw error;
      const list = (products ?? []) as CatalogueProduct[];
      const productIds = list.map((p) => p.id);
      const [variants, images] = await Promise.all([
        fetchInIdBatches<CatalogueVariant & { id: string }>(productIds, (batch) =>
          supabase
            .from("product_variants")
            .select("id, product_id, size, color, stock_qty, sale_price, mrp")
            .eq("organization_id", orgId!)
            .is("deleted_at", null)
            .in("product_id", batch)
            .order("id") as never,
        ),
        // Products with no main photo may still have one in the gallery.
        fetchProductImageMap(orgId!, list.filter((p) => !p.image_url).map((p) => p.id)),
      ]);
      return { products: list, variants, images: Object.fromEntries(images) as Record<string, string> };
    },
  });

  const items = useMemo(
    () =>
      data
        ? buildCatalogueItems(data.products, data.variants, {
            onlyInStock,
            onlyWithPhoto,
            images: new Map(Object.entries(data.images)),
          })
        : [],
    [data, onlyInStock, onlyWithPhoto],
  );
  const selected = items.filter((i) => !deselected.has(i.id));

  const shop = {
    name: (settings as { business_name?: string } | undefined)?.business_name || currentOrganization?.name || "",
    phone: (settings as { mobile_number?: string } | undefined)?.mobile_number || "",
    address: (settings as { address?: string } | undefined)?.address || "",
    logoUrl: (settings as { bill_barcode_settings?: { logo_url?: string } } | undefined)?.bill_barcode_settings?.logo_url || null,
  };
  const fileName = `${(shop.name || "Catalogue").replace(/[^\w]+/g, "_")}_Catalogue.pdf`;

  const makePdf = async () => {
    if (selected.length === 0) {
      toast.error("Select at least one product");
      return null;
    }
    if (selected.length > MAX_IN_PDF) {
      toast.error(`Up to ${MAX_IN_PDF} products per catalogue — narrow it by brand or category.`);
      return null;
    }
    return buildProductCataloguePdf(selected, { shop, title, priceMode, showSizes, showStock });
  };

  const download = async () => {
    setBusy("download");
    try {
      const blob = await makePdf();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Catalogue ready — ${selected.length} products`);
    } finally {
      setBusy("");
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const blob = await makePdf();
      if (!blob) return;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const text = `${title} — ${shop.name}`;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: text, text });
        return;
      }
      // Desktop: save the PDF and open the customer's WhatsApp chat to attach it.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      window.open(
        whatsappShareUrl(`Hello, please find our ${title.toLowerCase()} from ${shop.name}. (PDF attached)`, phone),
        "_blank",
        "noopener,noreferrer",
      );
      toast.info("PDF saved — attach it in the WhatsApp chat that opened.");
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") toast.error("Could not share the catalogue");
    } finally {
      setBusy("");
    }
  };

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-2 xl:col-span-4">
          {[
            ["Only in stock", onlyInStock, setOnlyInStock, "catalogue-in-stock"],
            ["Only with photo", onlyWithPhoto, setOnlyWithPhoto, "catalogue-with-photo"],
            ["Show sizes", showSizes, setShowSizes, "catalogue-sizes"],
            ["Show stock qty", showStock, setShowStock, "catalogue-stock"],
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
        {items.length > 0 && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeselected(new Set())}>Select all</Button>
            <Button variant="ghost" size="sm" onClick={() => setDeselected(new Set(items.map((i) => i.id)))}>Clear</Button>
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
            No products match. {onlyWithPhoto ? "Turn off “Only with photo” or add photos in Product Dashboard." : ""}
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
                  {showSizes && item.sizes.length > 0 && <p className="truncate text-xs">Sizes: {item.sizes.join(", ")}</p>}
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-sm font-bold text-teal-800">{price}</span>
                    {showStock && <span className="text-xs text-muted-foreground">Stock {item.stock}</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
