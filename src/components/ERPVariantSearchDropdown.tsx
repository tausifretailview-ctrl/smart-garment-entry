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
  // Common abbreviation mappings
  const abbrevMap: Record<string, string> = {
    "BK": "Black", "BL": "Blue", "GR": "Green", "GY": "Gray",
    "RD": "Red", "WH": "White", "YL": "Yellow", "OR": "Orange",
    "PK": "Pink", "PR": "Purple", "BR": "Brown", "NV": "Navy",
    "MHD": "Mahendi", "MRN": "Maroon", "CR": "Cream", "BG": "Beige",
    "LB": "Light Blue", "DG": "Dark Green", "OL": "Olive",
    "TN": "Tan", "CL": "Coral", "LV": "Lavender",
  };

  // Handle dot/period-separated color codes like RED.BK.MHD
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
  // If it's already properly cased, return as-is
  if (brand !== brand.toUpperCase() && brand !== brand.toLowerCase()) return brand;
  // Title case
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
};

const StockBadge = ({ qty }: { qty: number }) => {
  if (qty > 5) {
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800 text-xs font-semibold px-2 py-0.5 min-w-[60px] justify-center">
        Stock: {qty}
      </Badge>
    );
  }
  if (qty > 0) {
    return (
      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border-orange-200 dark:border-orange-800 text-xs font-semibold px-2 py-0.5 min-w-[60px] justify-center">
        Stock: {qty}
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800 text-xs font-semibold px-2 py-0.5 min-w-[60px] justify-center">
      Out of Stock
    </Badge>
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
        // Prevent blur from closing dropdown before click registers
        if (!isOutOfStock) e.preventDefault();
      }}
      onMouseEnter={onMouseEnter}
      className={cn(
        "w-full text-left px-4 py-2.5 border-b border-border last:border-0 transition-all duration-100 flex items-center gap-3",
        isSelected && "bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]",
        !isSelected && !isOutOfStock && "hover:bg-accent/60",
        isOutOfStock && "opacity-50 cursor-not-allowed"
      )}
      disabled={isOutOfStock}
    >
      {/* LEFT: Product info */}
      <div className="flex-1 min-w-0">
        {showProductName && (
          <div className="font-semibold text-[15px] leading-tight text-foreground truncate">
            {result.product_name}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[13px] text-muted-foreground">
          {color && (
            <span>
              <span className="text-muted-foreground/70">Color:</span>{" "}
              <span className="font-medium text-foreground/80">{color}</span>
            </span>
          )}
          {color && result.size && <span className="text-muted-foreground/40">|</span>}
          {result.size && (
            <span>
              <span className="text-muted-foreground/70">Size:</span>{" "}
              <span className="font-medium text-foreground/80">{result.size}</span>
            </span>
          )}
          {(color || result.size) && result.barcode && <span className="text-muted-foreground/40">|</span>}
          {result.barcode && (
            <span>
              <span className="text-muted-foreground/70">SKU:</span>{" "}
              <span className="font-mono text-foreground/70 text-[12px]">{result.barcode}</span>
            </span>
          )}
          {brand && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span>
                <span className="text-muted-foreground/70">Brand:</span>{" "}
                <span className="font-medium text-foreground/80">{brand}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* CENTER: Price */}
      <div className="text-right shrink-0 min-w-[80px]">
        <div className="font-bold text-[14px] text-primary">
          ₹{(result.sale_price || 0).toFixed(2)}
        </div>
        {result.mrp && result.mrp !== result.sale_price && (
          <div className="text-[12px] text-muted-foreground line-through">
            MRP: ₹{result.mrp}
          </div>
        )}
      </div>

      {/* RIGHT: Stock */}
      <div className="shrink-0">
        <StockBadge qty={result.stock_qty || 0} />
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
