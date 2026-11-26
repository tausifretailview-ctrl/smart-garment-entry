import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";
import { fetchProductImageMap } from "@/lib/productImages";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { whatsappShareUrl } from "@/lib/storefrontShare";
import {
  buildCatalogueItems,
  buildProductCataloguePdf,
  catalogueStockCounts,
  type CatalogueProduct,
  type CatalogueStockFilter,
  type CatalogueVariant,
  type CataloguePriceMode,
} from "@/lib/productCatalogue";

/**
 * Product Catalogue data and sending, shared by the office page (Reports → Product Catalogue)
 * and the Field Sales app's Catalogue screen: pick products (brand / category / search, stock,
 * with photo), then download the A4 PDF or send it on WhatsApp.
 */

/** Products read for one view (the server answers at most 1,000 rows per request). */
export const CATALOGUE_MAX_PRODUCTS = 1000;
/** Gallery rows scanned to find products whose only photo is in the gallery. */
const MAX_GALLERY_ROWS = 5000;
const PRODUCT_COLUMNS = "id, product_name, brand, category, style, color, image_url, default_sale_price";
export const CATALOGUE_MAX_IN_PDF = 240;
export const CATALOGUE_ALL = "__all__";

/** Products that have a gallery photo (first MAX_GALLERY_ROWS rows). The gallery is optional. */
async function fetchGalleryProductIds(orgId: string): Promise<string[]> {
  const ids = new Set<string>();
  try {
    for (let from = 0; from < MAX_GALLERY_ROWS; from += 1000) {
      const { data, error } = await supabase
        .from("product_images")
        .select("id, product_id")
        .eq("organization_id", orgId)
        .order("id")
        .range(from, from + 999);
      if (error) break;
      for (const row of data ?? []) if (row.product_id) ids.add(row.product_id);
      if (!data || data.length < 1000) break;
    }
  } catch {
    /* no gallery table: main photos only */
  }
  return [...ids];
}

/** Save a PDF on this device (download link). */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function useProductCatalogue() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: settings } = useSettings();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [brand, setBrand] = useState(CATALOGUE_ALL);
  const [category, setCategory] = useState(CATALOGUE_ALL);
  // Opens on products that have a photo and stock in hand: what a customer can be shown and sold.
  const [stockFilter, setStockFilter] = useState<CatalogueStockFilter>("in");
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
    queryKey: ["catalogue-products", orgId, debounced, brand, category, onlyWithPhoto],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    queryFn: async () => {
      const filtered = () => {
        let q = supabase
          .from("products")
          .select(PRODUCT_COLUMNS)
          .eq("organization_id", orgId!)
          .eq("status", "active")
          .is("deleted_at", null)
          .neq("product_type", "service");
        if (brand !== CATALOGUE_ALL) q = q.eq("brand", brand);
        if (category !== CATALOGUE_ALL) q = q.eq("category", category);
        if (debounced) {
          const t = debounced.replace(/[%,()]/g, " ");
          q = q.or(`product_name.ilike.%${t}%,brand.ilike.%${t}%,category.ilike.%${t}%,style.ilike.%${t}%`);
        }
        return q;
      };

      let list: CatalogueProduct[];
      let capped = false;
      if (onlyWithPhoto) {
        // Ask the server for the products that have a photo. Reading the first products by name
        // and dropping the ones without a photo showed little or nothing in a shop with
        // thousands of products and photos on a few of them.
        const { data: main, error } = await filtered()
          .not("image_url", "is", null)
          .neq("image_url", "")
          .order("product_name")
          .limit(CATALOGUE_MAX_PRODUCTS);
        if (error) throw error;
        list = (main ?? []) as CatalogueProduct[];
        capped = list.length >= CATALOGUE_MAX_PRODUCTS;
        // Products whose only photo is in the gallery (no main photo set).
        const have = new Set(list.map((p) => p.id));
        const galleryOnly = (await fetchGalleryProductIds(orgId!)).filter((id) => !have.has(id));
        if (galleryOnly.length > 0) {
          const extra = await fetchInIdBatches<CatalogueProduct>(galleryOnly, (batch) =>
            filtered().in("id", batch).order("id") as never,
          );
          list = [...list, ...extra].sort((a, b) => a.product_name.localeCompare(b.product_name));
        }
      } else {
        const { data: products, error } = await filtered().order("product_name").limit(CATALOGUE_MAX_PRODUCTS);
        if (error) throw error;
        list = (products ?? []) as CatalogueProduct[];
        capped = list.length >= CATALOGUE_MAX_PRODUCTS;
      }

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
      return { products: list, variants, images: Object.fromEntries(images) as Record<string, string>, capped };
    },
  });

  const items = useMemo(
    () =>
      data
        ? buildCatalogueItems(data.products, data.variants, {
            stock: stockFilter,
            onlyWithPhoto,
            images: new Map(Object.entries(data.images)),
          })
        : [],
    [data, stockFilter, onlyWithPhoto],
  );
  const stockCounts = useMemo(
    () =>
      data
        ? catalogueStockCounts(data.products, data.variants, {
            onlyWithPhoto,
            images: new Map(Object.entries(data.images)),
          })
        : null,
    [data, onlyWithPhoto],
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
    if (selected.length > CATALOGUE_MAX_IN_PDF) {
      toast.error(`Up to ${CATALOGUE_MAX_IN_PDF} products per catalogue — narrow it by brand or category.`);
      return null;
    }
    return buildProductCataloguePdf(selected, { shop, title, priceMode, showSizes, showStock });
  };

  const download = async () => {
    setBusy("download");
    try {
      const blob = await makePdf();
      if (!blob) return;
      saveBlob(blob, fileName);
      toast.success(`Catalogue ready — ${selected.length} products`);
    } catch {
      toast.error("Could not make the catalogue PDF");
    } finally {
      setBusy("");
    }
  };

  /**
   * Phone: the share sheet with the PDF attached (pick WhatsApp). Elsewhere: save the PDF and
   * open the customer's WhatsApp chat to attach it.
   */
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
      saveBlob(blob, fileName);
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
  const selectAll = () => setDeselected(new Set());
  const clearAll = () => setDeselected(new Set(items.map((i) => i.id)));

  return {
    search, setSearch,
    brand, setBrand,
    category, setCategory,
    stockFilter, setStockFilter,
    onlyWithPhoto, setOnlyWithPhoto,
    showSizes, setShowSizes,
    showStock, setShowStock,
    priceMode, setPriceMode,
    title, setTitle,
    phone, setPhone,
    deselected, toggle, selectAll, clearAll,
    busy,
    options,
    data,
    isFetching,
    items,
    selected,
    stockCounts,
    download,
    share,
  };
}
