import { Button } from "@/components/ui/button";
import { 
  Banknote, 
  CreditCard, 
  Smartphone, 
  MoreHorizontal,
  Loader2
} from "lucide-react";

interface MobilePOSBottomBarProps {
  quantity: number;
  finalAmount: number;
  hasItems: boolean;
  isSaving: boolean;
  onCashPayment: () => void;
  onUPIPayment: () => void;
  onCardPayment: () => void;
  onMoreOptions: () => void;
}

export const MobilePOSBottomBar = ({
  quantity,
  finalAmount,
  hasItems,
  isSaving,
  onCashPayment,
  onUPIPayment,
  onCardPayment,
  onMoreOptions,
}: MobilePOSBottomBarProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-primary text-primary-foreground p-3 z-50 safe-area-pb">
      {/* Summary Row */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs opacity-80">Items</span>
            <p className="text-lg font-bold">{quantity}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs opacity-80">Total</span>
          <p className="text-2xl font-bold">
            ₹{Math.round(finalAmount).toLocaleString('en-IN')}
          </p>
        </div>
      </div>
      
      {/* Payment Buttons Grid */}
      <div className="grid grid-cols-4 gap-2">
        <Button 
          onClick={onCashPayment}
          className="h-12 bg-green-600 hover:bg-green-700 text-white flex flex-col items-center justify-center gap-0.5"
          disabled={!hasItems || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Banknote className="h-5 w-5" />
              <span className="text-[10px]">Cash</span>
            </>
          )}
        </Button>
        
        <Button 
          onClick={onUPIPayment}
          className="h-12 bg-purple-600 hover:bg-purple-700 text-white flex flex-col items-center justify-center gap-0.5"
          disabled={!hasItems || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Smartphone className="h-5 w-5" />
              <span className="text-[10px]">UPI</span>
            </>
          )}
        </Button>
        
        <Button 
          onClick={onCardPayment}
          className="h-12 bg-cyan-600 hover:bg-cyan-700 text-white flex flex-col items-center justify-center gap-0.5"
          disabled={!hasItems || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <CreditCard className="h-5 w-5" />
              <span className="text-[10px]">Card</span>
            </>
          )}
        </Button>
        
        <Button 
          onClick={onMoreOptions}
          className="h-12 bg-slate-600 hover:bg-slate-700 text-white flex flex-col items-center justify-center gap-0.5"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px]">More</span>
        </Button>
      </div>
    </div>
  );
};
