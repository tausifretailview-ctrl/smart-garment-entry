import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { 
  Banknote, 
  CreditCard, 
  Smartphone, 
  Wallet,
  Pause,
  Printer,
  MessageCircle,
  RotateCcw,
  X
} from "lucide-react";

interface MobilePOSPaymentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (method: 'cash' | 'card' | 'upi' | 'pay_later') => void;
  onMixPayment: () => void;
  onHold: () => void;
  onPrint?: () => void;
  onWhatsApp?: () => void;
  onSaleReturn?: () => void;
  isSaving: boolean;
  hasItems: boolean;
  finalAmount: number;
}

export const MobilePOSPaymentSheet = ({
  open,
  onOpenChange,
  onPayment,
  onMixPayment,
  onHold,
  onPrint,
  onWhatsApp,
  onSaleReturn,
  isSaving,
  hasItems,
  finalAmount,
}: MobilePOSPaymentSheetProps) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-8">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-lg">Payment Options</DrawerTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>
        
        {/* Amount Display */}
        <div className="text-center py-4 border-b mb-4">
          <p className="text-sm text-muted-foreground">Total Amount</p>
          <p className="text-3xl font-bold text-primary">
            ₹{Math.round(finalAmount).toLocaleString('en-IN')}
          </p>
        </div>
        
        {/* Primary Payment Methods */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button
            onClick={() => {
              onPayment('cash');
              onOpenChange(false);
            }}
            className="h-14 bg-green-600 hover:bg-green-700 text-white flex-col gap-1"
            disabled={!hasItems || isSaving}
          >
            <Banknote className="h-5 w-5" />
            <span className="text-xs">Cash</span>
          </Button>
          
          <Button
            onClick={() => {
              onPayment('upi');
              onOpenChange(false);
            }}
            className="h-14 bg-purple-600 hover:bg-purple-700 text-white flex-col gap-1"
            disabled={!hasItems || isSaving}
          >
            <Smartphone className="h-5 w-5" />
            <span className="text-xs">UPI</span>
          </Button>
          
          <Button
            onClick={() => {
              onPayment('card');
              onOpenChange(false);
            }}
            className="h-14 bg-cyan-600 hover:bg-cyan-700 text-white flex-col gap-1"
            disabled={!hasItems || isSaving}
          >
            <CreditCard className="h-5 w-5" />
            <span className="text-xs">Card</span>
          </Button>
          
          <Button
            onClick={() => {
              onMixPayment();
              onOpenChange(false);
            }}
            className="h-14 bg-amber-600 hover:bg-amber-700 text-white flex-col gap-1"
            disabled={!hasItems || isSaving}
          >
            <Wallet className="h-5 w-5" />
            <span className="text-xs">Mix Payment</span>
          </Button>
        </div>
        
        {/* Secondary Actions */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Button
            onClick={() => {
              onPayment('pay_later');
              onOpenChange(false);
            }}
            variant="outline"
            className="h-12 flex-col gap-1"
            disabled={!hasItems || isSaving}
          >
            <CreditCard className="h-4 w-4" />
            <span className="text-xs">Credit</span>
          </Button>
          
          <Button
            onClick={() => {
              onHold();
              onOpenChange(false);
            }}
            variant="outline"
            className="h-12 flex-col gap-1"
            disabled={!hasItems || isSaving}
          >
            <Pause className="h-4 w-4" />
            <span className="text-xs">Hold</span>
          </Button>

          {onSaleReturn && (
            <Button
              onClick={() => {
                onSaleReturn();
                onOpenChange(false);
              }}
              variant="outline"
              className="h-12 flex-col gap-1"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-xs">Sale Return</span>
            </Button>
          )}
          
          {onPrint && (
            <Button
              onClick={() => {
                onPrint();
                onOpenChange(false);
              }}
              variant="outline"
              className="h-12 flex-col gap-1"
            >
              <Printer className="h-4 w-4" />
              <span className="text-xs">Print</span>
            </Button>
          )}
          
          {onWhatsApp && (
            <Button
              onClick={() => {
                onWhatsApp();
                onOpenChange(false);
              }}
              variant="outline"
              className="h-12 flex-col gap-1 col-span-3"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-xs">Share via WhatsApp</span>
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
