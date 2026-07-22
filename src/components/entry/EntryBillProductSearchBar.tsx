import { Loader2, Search } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn, buildProductDisplayName } from "@/lib/utils";
import { entryPageSectionX } from "@/lib/entryPageLayout";
import { ERPVariantRow, groupVariantsByProduct } from "@/components/ERPVariantSearchDropdown";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import {
  buildSaleOrderProductGroupKey,
  type SaleOrderProductSearchGroup,
  type SaleOrderVariantSearchResult,
} from "@/utils/saleOrderProductSearch";

export interface EntryBillProductSearchBarProps {
  entryMode: "grid" | "inline";
  onEntryModeChange: (mode: "grid" | "inline") => void;
  openProductSearch: boolean;
  onOpenProductSearchChange: (open: boolean) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  isProductSearching: boolean;
  displaySearchCount: number;
  displayLimit: number;
  onDisplayLimitIncrease: () => void;
  productSearchGroups: SaleOrderProductSearchGroup[];
  popoverSearchResults: SaleOrderVariantSearchResult[];
  onSelectGroup: (group: SaleOrderProductSearchGroup) => void;
  onSelectResult: (result: SaleOrderVariantSearchResult) => void;
  barcodeValue: string;
  onBarcodeValueChange: (value: string) => void;
  onBarcodeKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBarcodeScanned: (barcode: string) => void;
  totalQty?: number;
  browsePlaceholder?: string;
  noStockRestriction?: boolean;
  barcodeInputRef?: RefObject<HTMLInputElement | null>;
  productSearchInputRef?: RefObject<HTMLInputElement | null>;
  /** When true (default), SCAN BARCODE gets browser autofocus. */
  barcodeAutoFocus?: boolean;
}

export function EntryBillProductSearchBar({
  entryMode,
  onEntryModeChange,
  openProductSearch,
  onOpenProductSearchChange,
  searchInput,
  onSearchInputChange,
  isProductSearching,
  displaySearchCount,
  displayLimit,
  onDisplayLimitIncrease,
  productSearchGroups,
  popoverSearchResults,
  onSelectGroup,
  onSelectResult,
  barcodeValue,
  onBarcodeValueChange,
  onBarcodeKeyDown,
  onBarcodeScanned,
  totalQty,
  browsePlaceholder = "Browse products by name, brand, category, size...",
  noStockRestriction = false,
  barcodeInputRef,
  productSearchInputRef,
  barcodeAutoFocus = true,
}: EntryBillProductSearchBarProps) {
  const visibleGroups = productSearchGroups.slice(0, displayLimit);
  const visibleResults = popoverSearchResults.slice(0, displayLimit);

  return (
    <section className={cn("bg-neutral-50 border-b border-black/10 py-3 shrink-0", entryPageSectionX)}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 shrink-0 rounded-lg border border-black/15 bg-white px-3 py-1.5">
          <span className={cn("text-sm font-bold", entryMode === "grid" ? "text-black" : "text-black/50")}>
            Color & Size Grid
          </span>
          <Switch
            checked={entryMode === "inline"}
            onCheckedChange={(checked) => onEntryModeChange(checked ? "inline" : "grid")}
            aria-label="Toggle between size grid and inline entry"
          />
          <span className={cn("text-sm font-bold", entryMode === "inline" ? "text-black" : "text-black/50")}>
            Inline
          </span>
        </div>

        <div className="text-black/30 text-lg font-light select-none">|</div>

        <div className="flex gap-1 min-w-[220px] shrink-0">
          <Input
            ref={barcodeInputRef}
            autoFocus={barcodeAutoFocus}
            placeholder="SCAN BARCODE..."
            value={barcodeValue}
            onChange={(e) => onBarcodeValueChange(e.target.value)}
            onKeyDown={onBarcodeKeyDown}
            className="h-10 bg-white border-black/20 text-sm font-semibold font-mono uppercase"
          />
          <CameraScanButton onBarcodeScanned={onBarcodeScanned} className="h-10 w-10 shrink-0" />
        </div>

        <div className="text-black/30 text-lg font-light select-none hidden sm:block">|</div>

        <Popover open={openProductSearch} onOpenChange={onOpenProductSearchChange}>
          <PopoverTrigger asChild>
            <div className="relative flex-1 min-w-[240px] cursor-pointer">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
              <Input
                ref={productSearchInputRef}
                placeholder={noStockRestriction ? "Search Products (No Stock Restriction)" : browsePlaceholder}
                className="pl-10 pr-4 h-10 bg-white border-black/20 cursor-pointer text-sm font-semibold"
                readOnly
                onClick={() => onOpenProductSearchChange(true)}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[700px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search by name, barcode, brand, color, size..."
                value={searchInput}
                onValueChange={onSearchInputChange}
              />
              <CommandList className="max-h-[320px]">
                <CommandEmpty>
                  {isProductSearching ? (
                    <span className="flex items-center justify-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </span>
                  ) : searchInput.length < 1 ? (
                    "Type to search products..."
                  ) : (
                    "No products found"
                  )}
                </CommandEmpty>
                {displaySearchCount > displayLimit && (
                  <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                    <span>
                      Showing {Math.min(displayLimit, displaySearchCount)} of {displaySearchCount}{" "}
                      {entryMode === "grid" ? "products" : "results"}
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-primary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDisplayLimitIncrease();
                      }}
                    >
                      Load More
                    </Button>
                  </div>
                )}
                <CommandGroup>
                  {entryMode === "grid"
                    ? visibleGroups.map((group) => (
                        <CommandItem
                          key={`${buildSaleOrderProductGroupKey(group.representative, searchInput)}-${group.productIds.join("-")}`}
                          onSelect={() => {
                            onSelectGroup(group);
                            onOpenProductSearchChange(false);
                            onSearchInputChange("");
                          }}
                          className="group p-0 cursor-pointer"
                        >
                          <div className="flex w-full flex-col gap-1 px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-base font-bold text-foreground group-data-[selected=true]:text-white">
                                  {buildProductDisplayName({
                                    product_name: group.productName,
                                    brand: group.brand,
                                    style: group.style,
                                    category: group.category,
                                  })}
                                </span>
                                {group.size_range && (
                                  <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-semibold text-blue-600 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">
                                    {group.size_range}
                                  </span>
                                )}
                                {group.colorCount > 0 && (
                                  <span className="shrink-0 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 group-data-[selected=true]:border-white/30 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">
                                    {group.colorCount} color{group.colorCount === 1 ? "" : "s"}
                                  </span>
                                )}
                                <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 group-data-[selected=true]:border-white/30 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">
                                  {group.sizeCount} sizes
                                </span>
                              </div>
                              <span className="shrink-0 text-base font-bold text-primary group-data-[selected=true]:text-white">
                                ₹{(group.representative.sale_price || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <div className="flex flex-wrap gap-2 text-muted-foreground group-data-[selected=true]:text-white/85">
                                {group.style && <span>{group.style}</span>}
                                {group.brand && <span>{group.brand}</span>}
                              </div>
                              {!noStockRestriction && (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-md border px-2.5 py-1 text-base font-bold tabular-nums",
                                    group.totalStock > 0
                                      ? "border-emerald-200 bg-emerald-100 text-emerald-800 group-data-[selected=true]:border-white/30 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white"
                                      : "border-red-200 bg-red-100 text-red-800 group-data-[selected=true]:border-white/30 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white",
                                  )}
                                >
                                  Total Qty: {group.totalStock}
                                </span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))
                    : (() => {
                        const grouped = groupVariantsByProduct(visibleResults);
                        return grouped.flatMap((group) =>
                          group.variants.map((result) => (
                            <CommandItem
                              key={result.id}
                              onSelect={() => {
                                onSelectResult(result as SaleOrderVariantSearchResult);
                                onOpenProductSearchChange(false);
                                onSearchInputChange("");
                              }}
                              className="group p-0 cursor-pointer"
                            >
                              <ERPVariantRow
                                result={{
                                  id: result.id!,
                                  product_id: result.product_id,
                                  product_name: result.product_name,
                                  brand: result.brand,
                                  category: result.category,
                                  style: result.style,
                                  color: result.color || "",
                                  size: result.size,
                                  barcode: result.barcode,
                                  sale_price: result.sale_price,
                                  mrp: result.mrp,
                                  stock_qty: result.stock_qty || 0,
                                }}
                                showProductName={group.variants.length === 1}
                              />
                            </CommandItem>
                          )),
                        );
                      })()}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {totalQty !== undefined && (
          <div className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg ml-auto shrink-0">
            <span className="text-[12px] font-bold opacity-80">Total Qty</span>
            <span className="font-black tabular-nums text-[16px]">{totalQty}</span>
          </div>
        )}
      </div>
    </section>
  );
}
