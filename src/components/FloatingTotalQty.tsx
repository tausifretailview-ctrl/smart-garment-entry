import { useEffect, useState } from "react";
import { Package } from "lucide-react";

interface FloatingTotalQtyProps {
  totalQty: number;
  itemCount?: number;
  className?: string;
}

export function FloatingTotalQty({ totalQty, itemCount, className = "" }: FloatingTotalQtyProps) {
  const [animate, setAnimate] = useState(false);

  // Trigger pulse animation when quantity changes
  useEffect(() => {
    if (totalQty > 0) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [totalQty]);

  // Don't show if no items
  if (totalQty === 0) return null;

  return (
    <div
      className={`fixed bottom-32 right-6 z-40 
        bg-primary text-primary-foreground 
        rounded-2xl px-4 py-3 shadow-xl
        border border-primary/20
        transition-all duration-300
        ${animate ? "scale-110" : "scale-100"}
        ${className}`}
    >
      <div className="flex items-center gap-3">
        <Package className="h-5 w-5 opacity-80" />
        <div className="flex flex-col">
          <span className="text-xs font-medium opacity-80">Total Qty</span>
          <span className="text-2xl font-bold leading-tight">{totalQty}</span>
        </div>
        {itemCount !== undefined && itemCount > 0 && (
          <div className="text-xs opacity-70 ml-1">
            ({itemCount} items)
          </div>
        )}
      </div>
    </div>
  );
}
