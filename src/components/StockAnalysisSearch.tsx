import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductResult {
  id: string;
  product_name: string;
  brand: string;
  barcode: string;
  size: string;
  color: string;
  stock_qty: number;
}

interface StockAnalysisSearchProps {
  onProductSelect: (product: ProductResult) => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}

export function StockAnalysisSearch({
  onProductSelect,
  onClear,
  disabled = false,
  className,
}: StockAnalysisSearchProps) {
  const { currentOrganization } = useOrganization();
  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastKeystrokeRef = useRef<number>(0);

  const { recordKeystroke, reset: resetScanner, detectScannerInput } = useBarcodeScanner({
    minBarcodeLength: 4,
    maxKeystrokeInterval: 50,
  });

  // Update dropdown position
  const updatePosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 400),
      });
    }
  }, []);

  // Search for products
  const searchProducts = useCallback(async (term: string) => {
    if (!currentOrganization?.id || term.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch ALL variants first (without OR filter that breaks cross-table search)
      // Then filter client-side for product_name, brand, barcode, size, color
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          color,
          stock_qty,
          barcode,
          products!inner (
            product_name,
            brand,
            deleted_at
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("active", true)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .order("stock_qty", { ascending: false })
        .limit(1000); // Get more results for client-side filtering

      if (error) throw error;

      // Client-side filter for ALL fields including product_name/brand
      const termLower = term.toLowerCase();
      const formatted = (data || [])
        .filter((item: any) => {
          const productName = item.products?.product_name?.toLowerCase() || "";
          const brand = item.products?.brand?.toLowerCase() || "";
          const barcode = item.barcode?.toLowerCase() || "";
          const size = item.size?.toLowerCase() || "";
          const color = item.color?.toLowerCase() || "";
          return (
            productName.includes(termLower) ||
            brand.includes(termLower) ||
            barcode.includes(termLower) ||
            size.includes(termLower) ||
            color.includes(termLower)
          );
        })
        // Don't slice here - store all results for dynamic loading
        .map((item: any) => ({
          id: item.id,
          product_name: item.products?.product_name || "",
          brand: item.products?.brand || "",
          barcode: item.barcode || "",
          size: item.size || "",
          color: item.color || "",
          stock_qty: item.stock_qty || 0,
        }));

      setResults(formatted);
      setShowDropdown(formatted.length > 0);
      setSelectedIndex(-1);
      setDisplayLimit(100); // Reset display limit on new search
      updatePosition();
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id, updatePosition]);

  // Handle barcode scan - exact match
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    setShowDropdown(false);

    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          color,
          stock_qty,
          barcode,
          products!inner (
            product_name,
            brand,
            deleted_at
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("barcode", barcode.trim())
        .eq("active", true)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const product: ProductResult = {
          id: data.id,
          product_name: (data.products as any)?.product_name || "",
          brand: (data.products as any)?.brand || "",
          barcode: data.barcode || "",
          size: data.size || "",
          color: data.color || "",
          stock_qty: data.stock_qty || 0,
        };
        setSelectedProduct(product);
        setSearchInput(product.product_name);
        onProductSelect(product);
        toast.success(`Found: ${product.product_name}`);
      } else {
        toast.error("Product not found for this barcode");
        setSearchInput("");
      }
    } catch (error) {
      console.error("Barcode search error:", error);
      toast.error("Error searching for product");
    } finally {
      setLoading(false);
      resetScanner();
    }
  }, [currentOrganization?.id, onProductSelect, resetScanner]);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    setSelectedProduct(null);
    recordKeystroke();

    const now = Date.now();
    const timeSinceLastKeystroke = now - lastKeystrokeRef.current;
    lastKeystrokeRef.current = now;

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setResults([]);
      setShowDropdown(false);
      onClear();
      return;
    }

    // Check if this looks like a barcode scan
    if (detectScannerInput(value, timeSinceLastKeystroke)) {
      // Wait a tiny bit more to ensure scan is complete
      searchTimeoutRef.current = setTimeout(() => {
        handleBarcodeScan(value);
      }, 100);
    } else {
      // Manual typing - show dropdown with debounce
      searchTimeoutRef.current = setTimeout(() => {
        searchProducts(value);
      }, 300);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) {
      if (e.key === "Enter" && searchInput.trim()) {
        // Manual enter on text - search as barcode first
        handleBarcodeScan(searchInput.trim());
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleSelect = (product: ProductResult) => {
    setSearchInput(product.product_name);
    setSelectedProduct(product);
    setShowDropdown(false);
    onProductSelect(product);
  };

  const handleClear = () => {
    setSearchInput("");
    setSelectedProduct(null);
    setResults([]);
    setShowDropdown(false);
    onClear();
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const dropdown = showDropdown && (
    <div
      ref={dropdownRef}
      className="fixed bg-popover border border-border rounded-md shadow-lg overflow-hidden"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999,
        maxHeight: "350px",
        overflowY: "auto",
      }}
    >
      {results.length > displayLimit && (
        <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between sticky top-0">
          <span>Showing {displayLimit} of {results.length} results</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDisplayLimit(prev => prev + 100);
            }}
            className="text-primary font-medium hover:underline text-sm"
          >
            Load More
          </button>
        </div>
      )}
      {results.slice(0, displayLimit).map((product, index) => (
        <div
          key={product.id}
          className={cn(
            "px-3 py-2.5 cursor-pointer hover:bg-accent text-sm border-b border-border last:border-b-0 transition-colors",
            selectedIndex === index && "bg-primary text-primary-foreground"
          )}
          onClick={() => handleSelect(product)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{product.product_name}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                {product.brand && <span>{product.brand}</span>}
                {product.brand && product.size && <span>•</span>}
                {product.size && <span>Size: {product.size}</span>}
                {product.color && <span>• {product.color}</span>}
              </div>
              {product.barcode && (
                <div className={cn(
                  "text-xs mt-0.5 font-mono",
                  selectedIndex === index ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  Barcode: {product.barcode}
                </div>
              )}
            </div>
            <div className={cn(
              "text-xs font-semibold px-2 py-1 rounded shrink-0",
              product.stock_qty > 0 
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" 
                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
            )}>
              Qty: {product.stock_qty}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={searchInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 && !selectedProduct) {
              updatePosition();
              setShowDropdown(true);
            }
          }}
          placeholder="Type product name or scan barcode..."
          className="pl-10 pr-16 h-10"
          disabled={disabled}
        />
        {loading && (
          <Loader2 className="absolute right-10 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {(searchInput || selectedProduct) && !loading && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      
      {/* Helper text when no product selected */}
      {!searchInput && !selectedProduct && (
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
          <Package className="h-3 w-3" />
          Type product name or scan barcode to view stock analysis
        </p>
      )}

      {createPortal(dropdown, document.body)}
    </div>
  );
}

// Loading skeleton for stock analysis results
export function StockAnalysisLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Cards Skeleton */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between items-center mb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
