import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductResult {
  id: string;
  product_name: string;
  brand: string;
  barcode: string;
  size: string;
  color: string;
  stock_qty: number;
}

interface ProductSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (product: ProductResult) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function ProductSearchDropdown({
  value,
  onChange,
  onSelect,
  placeholder = "Search by product, brand, barcode...",
  className,
  onKeyDown,
}: ProductSearchDropdownProps) {
  const { currentOrganization } = useOrganization();
  const [results, setResults] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update dropdown position
  const updatePosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!value.trim() || value.length < 2 || !currentOrganization?.id) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const trimmed = value.trim();
        const looksLikeBarcode = /\d/.test(trimmed) && trimmed.length >= 5;

        // Build base query
        let query = supabase
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
              style,
              category,
              deleted_at
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null);

        // Add server-side filter for barcodes so they're found even beyond limit
        if (looksLikeBarcode) {
          query = query.or(`barcode.eq.${trimmed},barcode.ilike.${trimmed}%`);
        } else {
          // For text search, filter on product fields server-side
          const token = trimmed.split(/\s+/)[0]; // use first token for server filter
          if (token) {
            query = query.or(
              `product_name.ilike.%${token}%,brand.ilike.%${token}%,style.ilike.%${token}%,category.ilike.%${token}%`,
              { referencedTable: "products" }
            );
          }
        }

        const { data, error } = await query
          .order("stock_qty", { ascending: false })
          .limit(500);

        if (error) throw error;

        // Multi-token AND filter across all unified fields
        const tokens = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const formatted = (data || [])
          .filter((item: any) => {
            const haystack = [
              item.products?.product_name,
              item.products?.brand,
              item.products?.style,
              item.products?.category,
              item.barcode,
              item.size,
              item.color,
            ].map(f => (f || '')).join(' ').toLowerCase();
            return tokens.every(t => haystack.includes(t));
          })
          .map((item: any) => ({
            id: item.id,
            product_name: item.products?.product_name || "",
            brand: item.products?.brand || "",
            barcode: item.barcode || "",
            size: item.size || "",
            color: item.color || "",
            stock_qty: item.stock_qty || 0,
          }));

        const displayResults = formatted.slice(0, 50);
        setResults(displayResults);
        setShowDropdown(displayResults.length > 0);
        setSelectedIndex(-1);
        updatePosition();
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, currentOrganization?.id, updatePosition]);

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

  // Handle keyboard navigation
  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) {
      onKeyDown?.(e);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    } else {
      onKeyDown?.(e);
    }
  };

  const handleSelect = (product: ProductResult) => {
    onChange(product.product_name);
    onSelect(product);
    setShowDropdown(false);
  };

  const dropdown = showDropdown && (
    <div
      ref={dropdownRef}
      className="fixed bg-popover border border-border rounded-md shadow-lg overflow-hidden"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999,
        maxHeight: "300px",
        overflowY: "auto",
      }}
    >
      {results.map((product, index) => (
        <div
          key={product.id}
           className={cn(
             "px-3 py-2 cursor-pointer hover:bg-accent text-sm border-b border-border last:border-b-0",
             selectedIndex === index && "bg-primary text-primary-foreground"
           )}
           onMouseDown={(e) => e.preventDefault()}
           onClick={() => handleSelect(product)}
           onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{product.product_name}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                {product.brand && <span>{product.brand}</span>}
                {product.brand && product.size && <span>•</span>}
                {product.size && <span>Size: {product.size}</span>}
                {product.color && <span>• {product.color}</span>}
              </div>
              {product.barcode && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Barcode: {product.barcode}
                </div>
              )}
            </div>
            <div className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded shrink-0",
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDownInternal}
          onFocus={() => {
            if (results.length > 0) {
              updatePosition();
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          className="pl-10 pr-8"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {createPortal(dropdown, document.body)}
    </div>
  );
}
