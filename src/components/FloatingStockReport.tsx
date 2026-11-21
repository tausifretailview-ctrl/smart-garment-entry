import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  displaySaleStockQty,
  excludeServiceVariants,
  sumPhysicalStockTotals,
} from "@/utils/productStockDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buildProductTextOrFilter,
  expandProductSearchTerms,
  matchesProductSearchFields,
  restrictProductsToExactNameMatches,
} from "@/utils/productSearch";
import { FileText, Loader2, Package, Search, X } from "lucide-react";
import { ProductThumb } from "@/components/ProductThumb";
import { isUsableImageUrl } from "@/lib/productImages";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupVariantRowsByScan } from "@/utils/lookupVariantByScan";
import {
  divergentPurchaseBarcodeMessage,
  type DivergentPurchaseBarcode,
} from "@/utils/stockReportPurchaseBarcodeResolve";
import { isStockReportBarcodeLikeSearch } from "@/utils/stockReportPurchaseBarcodeResolve";

/** Rupee sign, stored as an escape so a bad file encoding cannot corrupt it. */
const QUICK_STOCK_CURRENCY = "\u20B9";

// Extracted from FloatingPOSReports.tsx so Quick Stock no longer shares a lazy-loaded
// chunk with Cashier Report / Daily Tally — that shared chunk caused Quick Stock to
// hang on "Loading stock report…" on slow connections or after deploy.
const QUICK_STOCK_VARIANT_SELECT = `
  id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id,
  product:products!inner(id, product_name, brand, category, style, product_type, deleted_at, organization_id, image_url)
`;

/** Same join shape as QUICK_STOCK but for lookupVariantRowsByScan (products alias). */
const QUICK_STOCK_SCAN_SELECT = `
  id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id,
  products!inner(id, product_name, brand, category, style, product_type, deleted_at, organization_id, image_url)
`;

function mapQuickStockScanRows(rows: Record<string, unknown>[]): any[] {
  return rows.map((row) => {
    const products = row.products as Record<string, unknown> | undefined;
    return {
      ...row,
      product: products ?? (row as { product?: unknown }).product,
    };
  });
}

async function searchQuickStockByBarcodeScan(
  orgId: string,
  term: string,
): Promise<{ rows: any[]; mismatch: DivergentPurchaseBarcode | null }> {
  if (!isStockReportBarcodeLikeSearch(term)) return { rows: [], mismatch: null };

  const scan = await lookupVariantRowsByScan(
    orgId,
    term,
    QUICK_STOCK_SCAN_SELECT.trim(),
    undefined,
    { excludeDeletedProducts: true },
  );
  if (scan.purchaseBarcodeMismatch) return { rows: [], mismatch: scan.purchaseBarcodeMismatch };
  if (!scan.rows.length) return { rows: [], mismatch: null };

  return { rows: excludeServiceVariants(mapQuickStockScanRows(scan.rows)), mismatch: null };
}

const QUICK_STOCK_PRODUCT_FIRST_PAGE = 100;

/**
 * The first product lookup stops at 100 rows. A common name (SHIRT) can match
 * hundreds of products; stopping there showed only part of the stock
 * (937 of 3,201). Load the rest in pages when the first page was full.
 */
async function fetchAllQuickStockProducts(orgId: string, productOr: string) {
  const PAGE = 1000;
  const all: Array<{ id: string; product_name?: string | null; brand?: string | null; category?: string | null; style?: string | null }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, category, style")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .neq("product_type", "service")
      .or(productOr)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

async function fetchVariantsForProductIds(orgId: string, productIds: string[]) {
  if (productIds.length === 0) return [] as any[];

  const PAGE = 1000;
  const CHUNK = 50;
  const all: any[] = [];

  for (let i = 0; i < productIds.length; i += CHUNK) {
    const chunk = productIds.slice(i, i + CHUNK);
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("product_variants")
        .select(QUICK_STOCK_VARIANT_SELECT)
        .eq("organization_id", orgId)
        .eq("products.organization_id", orgId)
        .is("products.deleted_at", null)
        .is("deleted_at", null)
        .eq("active", true)
        .neq("products.product_type", "service")
        .in("product_id", chunk)
        .order("stock_qty", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }

  return all;
}

/** Server search for Quick Stock â€” full variant set (not the truncated local cache). */
async function searchQuickStockVariants(orgId: string, rawQuery: string) {
  const term = rawQuery.trim();
  const empty = { rows: [] as any[], mismatch: null as DivergentPurchaseBarcode | null };
  if (!term) return empty;
  const safeTerm = term.replace(/[%_,()]/g, " ").trim();
  if (!safeTerm) return empty;

  // 0) Canonical scan resolution — exact barcode only. A purchase bill that points
  // at a different live barcode is a miss, not that other product.
  const scanMatches = await searchQuickStockByBarcodeScan(orgId, term);
  if (scanMatches.mismatch) return { rows: [], mismatch: scanMatches.mismatch };
  if (scanMatches.rows.length > 0) return { rows: excludeServiceVariants(scanMatches.rows), mismatch: null };

  // 1) Exact barcode, 2) numeric partial barcode, and 3) product-name match each
  // depend only on the input term, not on one another's results â€” run concurrently
  // and apply the same priority (exact barcode > numeric partial > product match).
  const isNumericPartialCandidate = /^\d{4,}$/.test(term);

  const tokens = safeTerm
    .toLowerCase()
    .split(/[\s-]+/)
    .map((t) => t.replace(/[%_,()]/g, ""))
    .filter(Boolean);
  const primary = tokens[0] || safeTerm.toLowerCase();
  const expanded = expandProductSearchTerms(primary);
  const productOr = buildProductTextOrFilter(expanded);

  const [exact, numericPartial, prodQ] = await Promise.all([
    supabase
      .from("product_variants")
      .select(QUICK_STOCK_VARIANT_SELECT)
      .eq("organization_id", orgId)
      .eq("products.organization_id", orgId)
      .is("products.deleted_at", null)
      .is("deleted_at", null)
      .eq("active", true)
      .neq("products.product_type", "service")
      .eq("barcode", term)
      .limit(50),
    isNumericPartialCandidate
      ? supabase
          .from("product_variants")
          .select(QUICK_STOCK_VARIANT_SELECT)
          .eq("organization_id", orgId)
          .eq("products.organization_id", orgId)
          .is("products.deleted_at", null)
          .is("deleted_at", null)
          .eq("active", true)
          .neq("products.product_type", "service")
          .ilike("barcode", `%${safeTerm}%`)
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    productOr
      ? supabase
          .from("products")
          .select("id, product_name, brand, category, style")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .neq("product_type", "service")
          .or(productOr)
          .limit(QUICK_STOCK_PRODUCT_FIRST_PAGE)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  if (exact.data && exact.data.length > 0) {
    return { rows: excludeServiceVariants(exact.data), mismatch: null };
  }

  if (numericPartial.data && numericPartial.data.length > 0) {
    return { rows: excludeServiceVariants(numericPartial.data), mismatch: null };
  }

  // 3) Product-level match â†’ all variants (paginated). Prefer this over size/color
  //    so a product code like FLK53 is never truncated by a 100-row variant OR.
  let products: Array<{
    id: string;
    product_name?: string | null;
    brand?: string | null;
    category?: string | null;
    style?: string | null;
  }> = prodQ.data || [];
  if (productOr && products.length >= QUICK_STOCK_PRODUCT_FIRST_PAGE) {
    products = await fetchAllQuickStockProducts(orgId, productOr);
  }

  // NOTE: no product-level AND-filter here. Colour and size live on
  // product_variants, so requiring every token to match product_name/brand/
  // category/style discarded valid products ("100 BLACK") before the variant
  // fetch ran. Narrowing is done by restrictProductsToExactNameMatches below,
  // and the variant-level filter (which includes color/size) applies the
  // remaining tokens.
  const exactOnly = restrictProductsToExactNameMatches(products, primary);
  if (exactOnly) products = exactOnly;

  if (products.length > 0) {
    const variants = await fetchVariantsForProductIds(
      orgId,
      products.map((p) => p.id),
    );
    const filtered =
      tokens.length <= 1
        ? variants
        : variants.filter((item: any) =>
            matchesProductSearchFields(
              {
                product_name: item.product?.product_name,
                brand: item.product?.brand,
                category: item.product?.category,
                style: item.product?.style,
                barcode: item.barcode,
                color: item.color,
                size: item.size,
              },
              safeTerm,
            ),
          );
    // A product-name match on just the first token (e.g. a style code) can
    // still leave zero results once the remaining token (often a colour or
    // size abbreviation, as in "PUL194-BR") is applied. Don't stop here â€”
    // fall through to the variant-level barcode/size/colour search below,
    // which covers this exact case ("style-colour" barcode formats).
    if (filtered.length > 0) return { rows: excludeServiceVariants(filtered), mismatch: null };
  }

  // 4) Variant-level size / color / barcode when no product matched.
  // Search broadly on the first token only â€” the DB can't do a phrase-order
  // match across spaces/hyphens the way real SKUs are formatted ("PUL194-RLX-BR"
  // vs a typed "PUL194 RLX BR") â€” then AND-filter the remaining tokens
  // client-side with the same token matcher used for the product path above,
  // so each token can live in whichever field actually holds it.
  const esc = safeTerm.replace(/[%_]/g, "");
  const primaryEsc = (tokens[0] || esc).replace(/[%_]/g, "");
  const variantQ = await supabase
    .from("product_variants")
    .select(QUICK_STOCK_VARIANT_SELECT)
    .eq("organization_id", orgId)
    .eq("products.organization_id", orgId)
    .is("products.deleted_at", null)
    .is("deleted_at", null)
    .eq("active", true)
    .neq("products.product_type", "service")
    .or(`barcode.ilike.%${primaryEsc}%,size.ilike.%${primaryEsc}%,color.ilike.%${primaryEsc}%`)
    .limit(200);
  const variantCandidates = excludeServiceVariants(variantQ.data || []);
  if (tokens.length <= 1) return { rows: variantCandidates, mismatch: null };
  return {
    rows: variantCandidates.filter((item: any) =>
    matchesProductSearchFields(
      {
        product_name: item.product?.product_name,
        brand: item.product?.brand,
        category: item.product?.category,
        style: item.product?.style,
        barcode: item.barcode,
        color: item.color,
        size: item.size,
      },
      safeTerm,
    ),
    ),
    mismatch: null,
  };
}

function quickStockSearchReady(rawQuery: string): boolean {
  const term = rawQuery.trim();
  if (!term) return false;
  if (isStockReportBarcodeLikeSearch(term)) return true;
  return term.length >= 2;
}

/** The fields the Photo column and the PDF read from a Quick Stock row. */
type QuickStockRow = {
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  stock_qty?: number | null;
  pur_price?: number | null;
  mrp?: number | null;
  sale_price?: number | null;
  product?: {
    product_name?: string | null;
    style?: string | null;
    brand?: string | null;
    category?: string | null;
    product_type?: string | null;
    image_url?: string | null;
  } | null;
};

// Floating Stock Report Dialog


export function FloatingStockReport({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Default cursor in the barcode/search field whenever the dialog opens,
  // so a scanner can fire immediately without an extra click.
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
      return;
    }
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery, open]);

  const {
    data: serverData,
    isFetching: isSearching,
    isFetched: serverFetched,
  } = useQuery({
    queryKey: ["floating-stock-search", currentOrganization?.id, debouncedQuery],
    queryFn: async () => {
      if (!currentOrganization?.id || !quickStockSearchReady(debouncedQuery)) {
        return { rows: [] as any[], mismatch: null as DivergentPurchaseBarcode | null };
      }
      return searchQuickStockVariants(currentOrganization.id, debouncedQuery);
    },
    enabled:
      !!currentOrganization?.id &&
      open &&
      quickStockSearchReady(debouncedQuery),
    staleTime: STALE_LIVE,
    refetchOnWindowFocus: false,
  });

  const querySettled =
    quickStockSearchReady(debouncedQuery) &&
    debouncedQuery === searchQuery.trim() &&
    serverFetched;
  const displayData = querySettled ? serverData?.rows || [] : [];
  const barcodeNotice = querySettled ? serverData?.mismatch ?? null : null;
  const showSearching = quickStockSearchReady(searchQuery.trim()) && !querySettled;
  const skipSupplierLookup = isStockReportBarcodeLikeSearch(searchQuery.trim());

  // Fetch supplier names for filtered variants
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const displayIdsKey = displayData.map((item: any) => item.id).join(",");
  useEffect(() => {
    if (
      skipSupplierLookup ||
      !displayData.length ||
      !currentOrganization?.id ||
      !querySettled
    ) {
      setSupplierMap({});
      return;
    }

    const variantIds = displayData.slice(0, 20).map((item: any) => item.id).slice(0, 50);

    void (async () => {
      try {
        const { data } = await supabase
          .from("purchase_items")
          .select("sku_id, purchase_bills:purchase_bills!inner(supplier_name)")
          .in("sku_id", variantIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50);

        const map: Record<string, string> = {};
        (data || []).forEach((row: any) => {
          if (row.sku_id && !map[row.sku_id]) {
            map[row.sku_id] = row.purchase_bills?.supplier_name || '';
          }
        });
        setSupplierMap(map);
      } catch {
        /* ignore */
      }
    })();
  }, [currentOrganization?.id, displayIdsKey, querySettled, skipSupplierLookup]);

  // Service/combo virtual stock (999999) must not inflate these â€” those aren't
  // physically-held units (FLEXI LS 100 MIX turned 215 real pcs into 10,00,214).
  const { qty: totalQty, value: totalStockValue } = sumPhysicalStockTotals(displayData || []);
  // Photo column only when a product in the list has a photo (layout unchanged otherwise).
  const hasImages = (displayData as QuickStockRow[]).some((item) => isUsableImageUrl(item.product?.image_url));
  const productLabel = (item: QuickStockRow) =>
    [item.product?.product_name, item.product?.style, item.product?.brand, item.product?.category, item.color]
      .filter(Boolean)
      .join(" - ");
  const exportPdf = async () => {
    if (!displayData?.length || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { exportQuickStockPdf } = await import("@/lib/quickStockPdf");
      await exportQuickStockPdf(
        (displayData as QuickStockRow[]).map((item) => ({
          product: productLabel(item),
          barcode: item.barcode || "",
          size: item.size || "",
          stock: displaySaleStockQty(item.product?.product_type, item.stock_qty),
          purPrice: item.pur_price,
          mrp: item.mrp,
          salePrice: item.sale_price,
          imageUrl: item.product?.image_url,
        })),
        { search: searchQuery.trim() },
      );
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Quick Stock Check
          </DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search by barcode, product name, brand, size..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {searchQuery.trim().length < 1 ? (
          <div className="text-center py-8 text-muted-foreground">
            Start typing to search products...
          </div>
        ) : displayData && displayData.length > 0 ? (
          <>
            {/* Summary */}
            <div className="flex gap-4 mb-3 items-end">
              <div className="bg-blue-50 dark:bg-blue-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Items Found</span>
                <p className="font-bold text-lg">{displayData.length}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Total Qty</span>
                <p className="font-bold text-lg">{totalQty.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Stock Value</span>
                <p className="font-bold text-lg">{QUICK_STOCK_CURRENCY}{Math.round(totalStockValue).toLocaleString('en-IN')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-1.5"
                onClick={() => void exportPdf()}
                disabled={pdfBusy}
                data-testid="quick-stock-pdf"
              >
                {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
              </Button>
              {showSearching && (
                <span className="text-xs text-muted-foreground pb-2">
                  {isSearching ? "Updating full stock..." : "Searching..."}
                </span>
              )}
            </div>

            {/* Stock Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {hasImages && <TableHead className="w-14" aria-label="Photo" />}
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Pur. Price</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.map((item: any) => {
                    const productType = item.product?.product_type;
                    const displayStock = displaySaleStockQty(productType, item.stock_qty);
                    return (
                      <TableRow key={item.id}>
                      {hasImages && (
                        <TableCell className="py-1.5">
                          <ProductThumb url={item.product?.image_url} alt={item.product?.product_name || ""} size={40} />
                        </TableCell>
                      )}
                      <TableCell>
                        <p className="font-medium">{productLabel(item)}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.barcode || '-'}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${displayStock <= 0 ? 'text-red-600' : displayStock < 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {displayStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{supplierMap[item.id] || '-'}</TableCell>
                      <TableCell className="text-right text-xs">{QUICK_STOCK_CURRENCY}{item.pur_price?.toLocaleString('en-IN') || '-'}</TableCell>
                      <TableCell className="text-right">{QUICK_STOCK_CURRENCY}{item.mrp?.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right font-medium">{QUICK_STOCK_CURRENCY}{item.sale_price?.toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : showSearching ? (
          <div className="text-center py-8 text-muted-foreground">Searching...</div>
        ) : barcodeNotice ? (
          <div className="text-center py-8">
            <p className="font-medium text-destructive">{divergentPurchaseBarcodeMessage(barcodeNotice).title}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {divergentPurchaseBarcodeMessage(barcodeNotice).description}
            </p>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No products found matching "{searchQuery}"
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

