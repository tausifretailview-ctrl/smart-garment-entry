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
  sale_price: number;
  pur_price: number;
  mrp: number;
  category: string;
  style: string;
  product_id: string;
  variant_id: string;
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
  placeholder = "Search by name, brand, category, style or barcode...",
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

        let query = supabase
          .from("product_variants")
          .select(`
            id,
            size,
            color,
            stock_qty,
            barcode,
            sale_price,
            pur_price,
            mrp,
            product_id,
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

        if (looksLikeBarcode) {
          query = query.or(`barcode.eq.${trimmed},barcode.ilike.${trimmed}%`);
        } else {
          const token = trimmed.split(/\s+/)[0];
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
            sale_price: item.sale_price || 0,
            pur_price: item.pur_price || 0,
            mrp: item.mrp || 0,
            category: item.products?.category || "",
            style: item.products?.style || "",
            product_id: item.product_id || "",
            variant_id: item.id,
          }));

        const displayResults = formatted.slice(0, 50);
        setResults(displayResults);
        setShowDropdown(displayResults.length > 0 || (tokens.length > 0 && formatted.length === 0));
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
        maxHeight: "360px",
        overflowY: "auto",
      }}
    >
      {results.length > 0 ? (
        <>
          <div className="px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground">
            {results.length} product{results.length !== 1 ? 's' : ''} found · type more to narrow down
          </div>
          {results.map((product, index) => (
            <div
              key={product.id}
              className={cn(
                "px-3 py-2.5 cursor-pointer border-b border-border/50 last:border-0 transition-colors",
                selectedIndex === index
                  ? "bg-primary text-primary-foreground border-l-2 border-l-primary"
                  : "hover:bg-accent"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(product)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* Row 1: Product name + stock badge */}
              <div className="flex justify-between items-start gap-2">
                <span className="font-semibold text-sm text-foreground leading-tight">
                  {product.product_name}
                </span>
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded shrink-0",
                  product.stock_qty > 0
                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                )}>
                  Stock: {product.stock_qty}
                </span>
              </div>
              {/* Row 2: Attribute chips */}
              <div className="flex flex-wrap gap-1 mt-1">
                {product.brand && (
                  <span className="text-[11px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">
                    {product.brand}
                  </span>
                )}
                {product.category && (
                  <span className="text-[11px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded">
                    {product.category}
                  </span>
                )}
                {product.style && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                    {product.style}
                  </span>
                )}
                {product.color && product.color !== '-' && (
                  <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {product.color}
                  </span>
                )}
                {product.size && (
                  <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                    Size: {product.size}
                  </span>
                )}
              </div>
              {/* Row 3: Barcode + Price */}
              <div className="flex justify-between items-center mt-1">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {product.barcode || '—'}
                </span>
                <span className="text-sm font-bold text-primary">
                  ₹{product.sale_price}
                </span>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          No products found for "{value.trim()}"
        </div>
      )}
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
