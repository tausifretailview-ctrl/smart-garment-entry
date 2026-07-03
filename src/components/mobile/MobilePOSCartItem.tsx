import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyInput } from "@/components/ui/qty-input";
import { Minus, Plus, Trash2 } from "lucide-react";
import { getUOMLabel } from "@/constants/uom";
import { adjustQtyByStep, minQtyForUom } from "@/utils/qtyInput";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  originalMrp: number | null;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
  productType?: string;
  uom?: string;
}

interface MobilePOSCartItemProps {
  item: CartItem;
  index: number;
  onQuantityChange: (index: number, qty: number) => void;
  onRemove: (index: number) => void;
  onPriceEdit?: (index: number, price: number) => void;
}

export const MobilePOSCartItem = ({ 
  item, 
  index, 
  onQuantityChange, 
  onRemove 
}: MobilePOSCartItemProps) => {
  const minQty = minQtyForUom(item.uom);

  return (
    <Card className="p-3 mb-2 bg-card border-border">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm leading-tight truncate">
            {item.productName}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.size}
            {item.color && ` • ${item.color}`}
            {item.discountPercent > 0 && (
              <span className="text-green-600 ml-1">-{item.discountPercent}%</span>
            )}
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex justify-between items-center mt-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="icon"
              className="h-10 w-10 text-lg font-bold"
              onClick={() => onQuantityChange(index, adjustQtyByStep(item.quantity, -1, item.uom))}
              disabled={item.quantity <= minQty}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <QtyInput
              uom={item.uom}
              value={item.quantity || minQty}
              onChange={(val) => onQuantityChange(index, val)}
              className="h-10 w-16 text-center text-base font-bold px-1 bg-muted/30 border-border/60"
              selectOnFocus={false}
            />
            <Button 
              variant="outline" 
              size="icon"
              className="h-10 w-10 text-lg font-bold"
              onClick={() => onQuantityChange(index, adjustQtyByStep(item.quantity, 1, item.uom))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {item.uom && item.uom !== "NOS" && item.uom !== "PCS" && (
            <span className="text-[10px] text-muted-foreground text-center">{getUOMLabel(item.uom)}</span>
          )}
        </div>
        
        <div className="text-right">
          {item.originalMrp && item.originalMrp > item.mrp && (
            <span className="text-xs text-muted-foreground line-through mr-2">
              ₹{Math.round(item.originalMrp * item.quantity).toLocaleString('en-IN')}
            </span>
          )}
          <span className="text-lg font-bold">
            ₹{Math.round(item.netAmount).toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </Card>
  );
};
