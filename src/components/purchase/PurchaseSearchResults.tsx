import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatProductDescription } from "@/utils/purchaseProductDescription";
import { purchaseSearchRateLabels } from "@/utils/purchaseProductSearchGroup";

/*
 * Purchase Entry product search results: the phone list under the search box and the desktop
 * dropdown under the "add a line" search cell. Moved out of PurchaseEntry.tsx unchanged
 * (Plan Phase 4, S4); searching and picking stay in PurchaseEntry.
 */

export type PurchaseSearchRow = Parameters<typeof purchaseSearchRateLabels>[0] & {
  id: string;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  style?: string | null;
  color?: string | null;
  size_range?: string | null;
  groupedVariantCount?: number;
  groupedMrpTierCount?: number;
};

/** Phone layout: up to 50 matches as cards (chips, size range, Buy / MRP / Sale). */
export function PurchaseMobileSearchResults<T extends PurchaseSearchRow>({
  results,
  onSelect,
}: {
  results: T[];
  onSelect: (result: T) => void;
}) {
  return (
    <div className="bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-auto -mx-0.5">
      {results.slice(0, 50).map((result, idx) => {
        const rates = purchaseSearchRateLabels(result);
        return (
          <button
            key={result.id + idx}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(result)}
            className="w-full text-left px-3.5 py-2.5 border-b border-border/30 last:border-0 active:bg-accent/70 transition-colors"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{result.product_name}</p>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  {result.brand && <span className="text-[11px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">{result.brand}</span>}
                  {result.category && <span className="text-[11px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded">{result.category}</span>}
                  {result.style && <span className="text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">{result.style}</span>}
                  {result.color && result.color !== "-" && <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{result.color}</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {result.size_range && <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{result.size_range}</span>}
                  {result.groupedVariantCount && result.groupedVariantCount > 1 && (
                    <span className="text-[11px] text-muted-foreground">{result.groupedVariantCount} sizes</span>
                  )}
                  {result.groupedMrpTierCount && result.groupedMrpTierCount > 1 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold">
                      {result.groupedMrpTierCount} MRP
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary">Buy: {rates.buy}</p>
                <p className="text-[12px] font-bold text-amber-600 dark:text-amber-400">MRP: {rates.mrp}</p>
                <p className="text-[11px] text-muted-foreground">Sale: {rates.sale}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Desktop: dropdown under the inline search box (portal to <body>, positioned from the box so
 * the table's overflow does not clip it). "Load More" in steps; Add New Product at the end.
 */
export function PurchaseInlineSearchMenu<T extends PurchaseSearchRow>({
  anchor,
  query,
  results,
  displayLimit,
  onLoadMore,
  selectedIndex,
  onHoverIndex,
  onSelect,
  onAddNew,
}: {
  anchor: HTMLElement;
  query: string;
  results: T[];
  displayLimit: number;
  onLoadMore: () => void;
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onSelect: (result: T) => void;
  onAddNew: () => void;
}) {
  const rect = anchor.getBoundingClientRect();
  const addNewButton = (
    <button
      onClick={onAddNew}
      className="w-full text-left px-4 py-3 text-primary font-medium border-t border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
    >
      <Plus className="h-4 w-4" />
      Add New Product
    </button>
  );
  return createPortal(
    <div
      className="bg-popover border border-border rounded-md shadow-xl max-h-80 overflow-auto"
      style={{
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.min(800, window.innerWidth - rect.left - 16),
        zIndex: 9999,
      }}
    >
      {results.length > 0 ? (
        <>
          {results.length > displayLimit && (
            <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
              <span>
                Showing {displayLimit} of {results.length} results
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadMore();
                }}
              >
                Load More
              </Button>
            </div>
          )}
          {results.slice(0, displayLimit).map((result, idx) => {
            const rates = purchaseSearchRateLabels(result);
            return (
              <button
                key={result.id + idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(result)}
                onMouseEnter={() => onHoverIndex(idx)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors",
                  idx === selectedIndex
                    ? "bg-primary text-primary-foreground [&_*]:text-primary-foreground"
                    : "text-popover-foreground hover:bg-accent/50",
                )}
              >
                <div className="font-medium flex items-center gap-2">
                  <span>
                    {formatProductDescription({
                      product_name: result.product_name,
                      category: result.category,
                      brand: result.brand,
                      style: result.style,
                      color: result.color,
                    })}
                  </span>
                  {result.size_range && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                      {result.size_range}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {result.groupedVariantCount && result.groupedVariantCount > 1 && <span>{result.groupedVariantCount} sizes</span>}
                  {result.groupedMrpTierCount && result.groupedMrpTierCount > 1 && (
                    <span className="text-amber-700 dark:text-amber-400 font-semibold">{result.groupedMrpTierCount} MRP</span>
                  )}
                  <span className="text-primary font-medium">Pur: {rates.buy}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">MRP: {rates.mrp}</span>
                  <span className="text-green-600 dark:text-green-400 font-medium">Sale: {rates.sale}</span>
                </div>
              </button>
            );
          })}
          {/* Add New Product button at bottom of results */}
          {addNewButton}
        </>
      ) : query.length >= 1 ? (
        <>
          <div className="px-4 py-3 text-sm text-muted-foreground">No products found for "{query}"</div>
          {/* Add New Product button when no results */}
          {addNewButton}
        </>
      ) : null}
    </div>,
    document.body,
  );
}
