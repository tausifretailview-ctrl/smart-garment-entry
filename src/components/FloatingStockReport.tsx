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
import { Package, Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupVariantRowsByScan } from "@/utils/lookupVariantByScan";
import { isStockReportBarcodeLikeSearch } from "@/utils/stockReportPurchaseBarcodeResolve";

// Extracted from FloatingPOSReports.tsx so Quick Stock no longer shares a lazy-loaded
// chunk with Cashier Report / Daily Tally — that shared chunk caused Quick Stock to
// hang on "Loading stock report…" on slow connections or after deploy.
const QUICK_STOCK_VARIANT_SELECT = `
  id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id,
  product:products!inner(id, product_name, brand, category, style, product_type, deleted_at, organization_id)
`;

/** Same join shape as QUICK_STOCK but for lookupVariantRowsByScan (products alias). */
const QUICK_STOCK_SCAN_SELECT = `
  id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id,
  products!inner(id, product_name, brand, category, style, product_type, deleted_at, organization_id)
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

async function searchQuickStockByBarcodeScan(orgId: string, term: string): Promise<any[]> {
  if (!isStockReportBarcodeLikeSearch(term)) return [];

  const scan = await lookupVariantRowsByScan(orgId, term, QUICK_STOCK_SCAN_SELECT.trim());
  if (!scan.rows.length) return [];

  return excludeServiceVariants(mapQuickStockScanRows(scan.rows));
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
  if (!term) return [] as any[];
  const safeTerm = term.replace(/[%_,()]/g, " ").trim();
  if (!safeTerm) return [] as any[];

  // 0) Canonical scan resolution â€” purchase-label barcode + doubled scan (same as POS)
  const scanMatches = await searchQuickStockByBarcodeScan(orgId, term);
  if (scanMatches.length > 0) return excludeServiceVariants(scanMatches);

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
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  if (exact.data && exact.data.length > 0) return excludeServiceVariants(exact.data);

  if (numericPartial.data && numericPartial.data.length > 0) {
    return excludeServiceVariants(numericPartial.data);
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
    if (filtered.length > 0) return excludeServiceVariants(filtered);
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
  if (tokens.length <= 1) return variantCandidates;
  return variantCandidates.filter((item: any) =>
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
}

function quickStockSearchReady(rawQuery: string): boolean {
  const term = rawQuery.trim();
  if (!term) return false;
  if (isStockReportBarcodeLikeSearch(term)) return true;
  return term.length >= 2;
}

// Floating Stock Report Dialog
export function FloatingStockReport({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
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
      if (!currentOrganization?.id || !quickStockSearchReady(debouncedQuery)) return [];
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
  const displayData = querySettled ? serverData || [] : [];
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
                <p className="font-bold text-lg">â‚¹{Math.round(totalStockValue).toLocaleString('en-IN')}</p>
              </div>
              {showSearching && (
                <span className="text-xs text-muted-foreground pb-2">
                  {isSearching ? "Updating full stockâ€¦" : "Searchingâ€¦"}
                </span>
              )}
            </div>

            {/* Stock Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
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
                      <TableCell>
                        <p className="font-medium">
                          {[
                            item.product?.product_name,
                            item.product?.style,
                            item.product?.brand,
                            item.product?.category,
                            item.color,
                          ].filter(Boolean).join(' - ')}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.barcode || '-'}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${displayStock <= 0 ? 'text-red-600' : displayStock < 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {displayStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{supplierMap[item.id] || '-'}</TableCell>
                      <TableCell className="text-right text-xs">â‚¹{item.pur_price?.toLocaleString('en-IN') || '-'}</TableCell>
                      <TableCell className="text-right">â‚¹{item.mrp?.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right font-medium">â‚¹{item.sale_price?.toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : showSearching ? (
          <div className="text-center py-8 text-muted-foreground">Searchingâ€¦</div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No products found matching "{searchQuery}"
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

