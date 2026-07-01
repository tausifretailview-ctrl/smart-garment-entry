import { useEffect, useState } from "react";
import { scoreProductSearchMatch } from "@/utils/productSearch";
import {
  enrichSaleOrderSearchGroups,
  groupVariantsByProductFamily,
  searchSaleOrderVariants,
  buildSaleOrderProductGroupKey,
  type SaleOrderProductSearchGroup,
  type SaleOrderVariantSearchResult,
} from "@/utils/saleOrderProductSearch";

export function useEntryBillProductSearch(
  orgId: string | undefined,
  entryMode: "grid" | "inline",
) {
  const [searchInput, setSearchInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [popoverSearchResults, setPopoverSearchResults] = useState<SaleOrderVariantSearchResult[]>([]);
  const [productSearchGroups, setProductSearchGroups] = useState<SaleOrderProductSearchGroup[]>([]);
  const [isProductSearching, setIsProductSearching] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);

  useEffect(() => {
    setDisplayLimit(100);
  }, [searchInput]);

  useEffect(() => {
    if (!searchInput || searchInput.length < 1 || !orgId) {
      setPopoverSearchResults([]);
      setProductSearchGroups([]);
      setIsProductSearching(false);
      return;
    }

    setIsProductSearching(true);
    const query = searchInput;
    const timer = setTimeout(async () => {
      try {
        const results = await searchSaleOrderVariants(orgId, query);
        setPopoverSearchResults(results);
        const grouped = groupVariantsByProductFamily(results, query);
        const enriched = await enrichSaleOrderSearchGroups(orgId, grouped, query);
        setProductSearchGroups(
          [...enriched].sort((a, b) => {
            const scoreA = scoreProductSearchMatch(
              { product_name: a.productName, brand: a.brand, style: a.style, category: a.category },
              query,
            );
            const scoreB = scoreProductSearchMatch(
              { product_name: b.productName, brand: b.brand, style: b.style, category: b.category },
              query,
            );
            return scoreB - scoreA;
          }),
        );
      } catch (error) {
        console.error("Product search error:", error);
        setPopoverSearchResults([]);
        setProductSearchGroups([]);
      } finally {
        setIsProductSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchInput, orgId]);

  const displaySearchCount =
    entryMode === "grid" ? productSearchGroups.length : popoverSearchResults.length;

  const resolveSearchSelection = (
    result: SaleOrderVariantSearchResult,
    query: string,
    handlers: {
      onOpenSizeGrid: (productIds: string[], salePrice?: number) => void;
      onAddVariant: (result: SaleOrderVariantSearchResult, options?: { skipSizeGrid?: boolean }) => void;
    },
  ) => {
    const trimmedQuery = query.trim();
    const isBarcodeMatch =
      Boolean(result.barcode) &&
      trimmedQuery.length > 0 &&
      result.barcode.toLowerCase() === trimmedQuery.toLowerCase();

    if (entryMode === "grid" && !isBarcodeMatch) {
      const group =
        productSearchGroups.find(
          (g) =>
            buildSaleOrderProductGroupKey(g.representative, trimmedQuery) ===
            buildSaleOrderProductGroupKey(result, trimmedQuery),
        ) ?? productSearchGroups.find((g) => g.productIds.includes(result.product_id));
      if (group) {
        handlers.onOpenSizeGrid(group.productIds, group.representative.sale_price);
      } else {
        handlers.onOpenSizeGrid([result.product_id], result.sale_price);
      }
      return;
    }

    handlers.onAddVariant(result, { skipSizeGrid: isBarcodeMatch });
  };

  return {
    searchInput,
    setSearchInput,
    barcodeInput,
    setBarcodeInput,
    openProductSearch,
    setOpenProductSearch,
    popoverSearchResults,
    productSearchGroups,
    isProductSearching,
    displayLimit,
    setDisplayLimit,
    displaySearchCount,
    resolveSearchSelection,
  };
}
