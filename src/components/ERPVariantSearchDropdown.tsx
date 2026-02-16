import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface VariantResult {
  id: string;
  product_id?: string;
  product_name: string;
  brand?: string;
  category?: string;
  style?: string;
  color?: string;
  size?: string;
  barcode?: string;
  sale_price?: number;
  mrp?: number;
  stock_qty?: number;
}

interface ERPVariantRowProps {
  result: VariantResult;
  isSelected?: boolean;
  isGrouped?: boolean;
  showProductName?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

/** Format raw color codes into readable names */
const formatColorName = (color: string): string => {
  if (!color) return "";
  const abbrevMap: Record<string, string> = {
    "BK": "Black", "BL": "Blue", "GR": "Green", "GY": "Gray",
    "RD": "Red", "WH": "White", "YL": "Yellow", "OR": "Orange",
    "PK": "Pink", "PR": "Purple", "BR": "Brown", "NV": "Navy",
    "MHD": "Mahendi", "MRN": "Maroon", "CR": "Cream", "BG": "Beige",
    "LB": "Light Blue", "DG": "Dark Green", "OL": "Olive",
    "TN": "Tan", "CL": "Coral", "LV": "Lavender",
  };
  const parts = color.split(/[.,\/\-]/).map(p => p.trim()).filter(Boolean);
  const formatted = parts.map(part => {
    const upper = part.toUpperCase();
    return abbrevMap[upper] || (part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  });
  return formatted.join(" / ");
};

/** Format brand names properly */
const formatBrandName = (brand: string): string => {
  if (!brand) return "";
  if (brand !== brand.toUpperCase() && brand !== brand.toLowerCase()) return brand;
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
};

const StockBadge = ({ qty, isSelected }: { qty: number; isSelected?: boolean }) => {
  if (isSelected) {
    // White-on-blue style when row is selected
    const label = qty > 5 ? `Stock: ${qty}` : qty > 0 ? `Stock: ${qty}` : "Out of Stock";
    return (
      <span className="inline-flex items-center justify-center text-[12px] font-semibold px-2.5 py-1 rounded-md min-w-[70px] bg-white/20 text-white border border-white/30">
        {label}
      </span>
    );
  }

  if (qty > 5) {
    return (
      <span className="inline-flex items-center justify-center text-[12px] font-semibold px-2.5 py-1 rounded-md min-w-[70px] bg-[#DCFCE7] text-[#166534] dark:bg-green-900/50 dark:text-green-300 border border-green-200 dark:border-green-800">
        Stock: {qty}
      </span>
    );
  }
  if (qty > 0) {
    return (
      <span className="inline-flex items-center justify-center text-[12px] font-semibold px-2.5 py-1 rounded-md min-w-[70px] bg-[#FEF3C7] text-[#92400E] dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        Stock: {qty}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center text-[12px] font-semibold px-2.5 py-1 rounded-md min-w-[70px] bg-[#FEE2E2] text-[#991B1B] dark:bg-red-900/50 dark:text-red-300 border border-red-200 dark:border-red-800">
      Out of Stock
    </span>
  );
};

export const ERPVariantRow = ({
  result,
  isSelected = false,
  showProductName = true,
  onClick,
  onMouseEnter,
}: ERPVariantRowProps) => {
  const isOutOfStock = (result.stock_qty || 0) <= 0;
  const color = formatColorName(result.color || "");
  const brand = formatBrandName(result.brand || "");

  return (
    <button
      type="button"
      onClick={isOutOfStock ? undefined : onClick}
      onMouseDown={(e) => {
        if (!isOutOfStock) e.preventDefault();
      }}
      onMouseEnter={onMouseEnter}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors duration-75 flex items-center gap-4",
        isSelected && "bg-primary text-primary-foreground",
        !isSelected && !isOutOfStock && "hover:bg-accent",
        isOutOfStock && !isSelected && "opacity-60 cursor-not-allowed bg-muted/30"
      )}
      disabled={isOutOfStock}
    >
      {/* LEFT: Product info */}
      <div className="flex-1 min-w-0">
        {showProductName && (
          <div className={cn(
            "font-semibold text-[16px] leading-snug truncate",
            isSelected ? "text-primary-foreground" : "text-foreground"
          )}>
            {result.product_name}
          </div>
        )}
        <div className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-medium",
          showProductName ? "mt-1" : "mt-0",
          isSelected ? "text-primary-foreground/90" : "text-foreground/80"
        )}>
          {color && (
            <span className="inline-flex items-center gap-1">
              <span className={cn(
                "inline-block w-2 h-2 rounded-full shrink-0",
                isSelected ? "bg-primary-foreground/60" : "bg-foreground/40"
              )} />
              <span className={cn(
                "font-semibold tracking-wide",
                isSelected ? "text-primary-foreground" : "text-foreground"
              )}>{color}</span>
            </span>
          )}
          {color && result.size && (
            <span className={isSelected ? "text-primary-foreground/40" : "text-foreground/30"}>|</span>
          )}
          {result.size && (
            <span>
              <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>Size:</span>{" "}
              <span className={cn("font-semibold", isSelected ? "text-primary-foreground" : "text-foreground")}>{result.size}</span>
            </span>
          )}
          {(color || result.size) && result.barcode && (
            <span className={isSelected ? "text-primary-foreground/40" : "text-foreground/30"}>|</span>
          )}
          {result.barcode && (
            <span>
              <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>SKU:</span>{" "}
              <span className={cn("font-mono text-[13px]", isSelected ? "text-primary-foreground" : "text-foreground/80")}>{result.barcode}</span>
            </span>
          )}
          {brand && (
            <>
              <span className={isSelected ? "text-primary-foreground/40" : "text-foreground/30"}>|</span>
              <span>
                <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>Brand:</span>{" "}
                <span className={cn("font-semibold", isSelected ? "text-primary-foreground" : "text-foreground")}>{brand}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* CENTER: Price */}
      <div className="text-right shrink-0 min-w-[85px]">
        <div className={cn(
          "font-bold text-[15px]",
          isSelected ? "text-primary-foreground" : "text-primary"
        )}>
          ₹{(result.sale_price || 0).toFixed(2)}
        </div>
        {result.mrp && result.mrp !== result.sale_price && (
          <div className={cn(
            "text-[13px] line-through",
            isSelected ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            MRP: ₹{result.mrp}
          </div>
        )}
      </div>

      {/* RIGHT: Stock */}
      <div className="shrink-0">
        <StockBadge qty={result.stock_qty || 0} isSelected={isSelected} />
      </div>
    </button>
  );
};

/** Group variants by parent product for cleaner display */
interface GroupedProduct {
  productName: string;
  productId: string;
  brand?: string;
  variants: VariantResult[];
}

export const groupVariantsByProduct = (results: VariantResult[]): GroupedProduct[] => {
  const groups: Record<string, GroupedProduct> = {};
  results.forEach(r => {
    const key = r.product_id || r.product_name;
    if (!groups[key]) {
      groups[key] = {
        productName: r.product_name,
        productId: r.product_id || "",
        brand: r.brand,
        variants: [],
      };
    }
    groups[key].variants.push(r);
  });
  return Object.values(groups);
};

export { formatColorName, formatBrandName };
export type { VariantResult };
