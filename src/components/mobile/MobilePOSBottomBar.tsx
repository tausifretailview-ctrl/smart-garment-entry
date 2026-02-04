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
    <div className="fixed bottom-0 left-0 right-0 bg-primary text-primary-foreground p-2 z-50 safe-area-pb">
      {/* Compact Summary Row */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium">Items: {quantity}</span>
        <span className="text-xl font-bold">
          ₹{Math.round(finalAmount).toLocaleString('en-IN')}
        </span>
      </div>
      
      {/* Payment Buttons Grid - More Compact */}
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
  );
};
