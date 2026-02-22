import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Banknote, 
  CreditCard, 
  Smartphone, 
  MoreHorizontal,
  Loader2,
  Percent,
  IndianRupee,
  Tag
} from "lucide-react";

interface MobilePOSBottomBarProps {
  quantity: number;
  finalAmount: number;
  subtotal: number;
  hasItems: boolean;
  isSaving: boolean;
  onCashPayment: () => void;
  onUPIPayment: () => void;
  onCardPayment: () => void;
  onMoreOptions: () => void;
  flatDiscountValue: number;
  flatDiscountMode: 'percent' | 'amount';
  onFlatDiscountValueChange: (value: number) => void;
  onFlatDiscountModeChange: (mode: 'percent' | 'amount') => void;
}

export const MobilePOSBottomBar = ({
  quantity,
  finalAmount,
  subtotal,
  hasItems,
  isSaving,
  onCashPayment,
  onUPIPayment,
  onCardPayment,
  onMoreOptions,
  flatDiscountValue,
  flatDiscountMode,
  onFlatDiscountValueChange,
  onFlatDiscountModeChange,
}: MobilePOSBottomBarProps) => {
  const [showDiscount, setShowDiscount] = useState(false);

  const discountDisplay = flatDiscountValue > 0
    ? flatDiscountMode === 'percent'
      ? `${flatDiscountValue}%`
      : `₹${flatDiscountValue}`
    : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-primary text-primary-foreground z-50 safe-area-pb">
      {/* Discount Row */}
      {showDiscount && (
        <div className="bg-primary/90 px-3 py-2 flex items-center gap-2 border-b border-primary-foreground/20">
          <Tag className="h-4 w-4 shrink-0" />
          <Input
            type="number"
            inputMode="decimal"
            value={flatDiscountValue || ''}
            onChange={(e) => onFlatDiscountValueChange(Number(e.target.value) || 0)}
            placeholder="Discount"
            className="h-8 w-32 bg-primary-foreground/20 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/50 text-sm"
          />
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 px-2 text-primary-foreground ${flatDiscountMode === 'percent' ? 'bg-primary-foreground/30' : 'bg-primary-foreground/10'}`}
            onClick={() => onFlatDiscountModeChange('percent')}
          >
            <Percent className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 px-2 text-primary-foreground ${flatDiscountMode === 'amount' ? 'bg-primary-foreground/30' : 'bg-primary-foreground/10'}`}
            onClick={() => onFlatDiscountModeChange('amount')}
          >
            <IndianRupee className="h-3.5 w-3.5" />
          </Button>
          {flatDiscountValue > 0 && (
            <span className="text-xs text-primary-foreground/80 ml-auto whitespace-nowrap">
              -₹{(flatDiscountMode === 'percent' ? (subtotal * flatDiscountValue / 100) : flatDiscountValue).toLocaleString('en-IN')}
            </span>
          )}
        </div>
      )}

      <div className="p-2">
        {/* Compact Summary Row */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Items: {quantity}</span>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-2 text-[10px] text-primary-foreground ${discountDisplay ? 'bg-green-500/30' : 'bg-primary-foreground/10'}`}
              onClick={() => setShowDiscount(!showDiscount)}
            >
              <Tag className="h-3 w-3 mr-1" />
              {discountDisplay || 'Disc'}
            </Button>
          </div>
          <span className="text-xl font-bold">
            ₹{Math.round(finalAmount).toLocaleString('en-IN')}
          </span>
        </div>
        
        {/* Payment Buttons Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <Button 
            onClick={onCashPayment}
            className="h-10 bg-green-600 hover:bg-green-700 text-white flex flex-col items-center justify-center gap-0"
            disabled={!hasItems || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Banknote className="h-4 w-4" />
                <span className="text-[9px]">Cash</span>
              </>
            )}
          </Button>
          
          <Button 
            onClick={onUPIPayment}
            className="h-10 bg-purple-600 hover:bg-purple-700 text-white flex flex-col items-center justify-center gap-0"
            disabled={!hasItems || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Smartphone className="h-4 w-4" />
                <span className="text-[9px]">UPI</span>
              </>
            )}
          </Button>
          
          <Button 
            onClick={onCardPayment}
            className="h-10 bg-cyan-600 hover:bg-cyan-700 text-white flex flex-col items-center justify-center gap-0"
            disabled={!hasItems || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                <span className="text-[9px]">Card</span>
              </>
            )}
          </Button>
          
          <Button 
            onClick={onMoreOptions}
            className="h-10 bg-slate-600 hover:bg-slate-700 text-white flex flex-col items-center justify-center gap-0"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="text-[9px]">More</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
