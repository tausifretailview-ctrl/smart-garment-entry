import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, Smartphone } from "lucide-react";

interface MixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billAmount: number;
  onSave: (paymentData: {
    cashAmount: number;
    cardAmount: number;
    upiAmount: number;
    totalPaid: number;
  }) => void;
}

export function MixPaymentDialog({
  open,
  onOpenChange,
  billAmount,
  onSave,
}: MixPaymentDialogProps) {
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [upiAmount, setUpiAmount] = useState(0);

  const totalPaid = cashAmount + cardAmount + upiAmount;
  const balanceAmount = billAmount - totalPaid;

  // Reset amounts when dialog closes
  useEffect(() => {
    if (!open) {
      setCashAmount(0);
      setCardAmount(0);
      setUpiAmount(0);
    }
  }, [open]);

  const handleSave = () => {
    if (totalPaid <= 0) {
      return;
    }

    onSave({
      cashAmount,
      cardAmount,
      upiAmount,
      totalPaid,
    });

    onOpenChange(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mix Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bill Amount */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Bill Amount:</span>
            <span className="text-lg font-bold">{formatCurrency(billAmount)}</span>
          </div>

          {/* Cash Amount */}
          <div className="space-y-2">
            <Label htmlFor="cash" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Cash Amount
            </Label>
            <Input
              id="cash"
              type="number"
              min="0"
              step="0.01"
              value={cashAmount || ""}
              onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
              placeholder="₹ 0.00"
              className="text-right"
            />
          </div>

          {/* Card Amount */}
          <div className="space-y-2">
            <Label htmlFor="card" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Card Amount
            </Label>
            <Input
              id="card"
              type="number"
              min="0"
              step="0.01"
              value={cardAmount || ""}
              onChange={(e) => setCardAmount(Number(e.target.value) || 0)}
              placeholder="₹ 0.00"
              className="text-right"
            />
          </div>

          {/* UPI Amount */}
          <div className="space-y-2">
            <Label htmlFor="upi" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              UPI Amount
            </Label>
            <Input
              id="upi"
              type="number"
              min="0"
              step="0.01"
              value={upiAmount || ""}
              onChange={(e) => setUpiAmount(Number(e.target.value) || 0)}
              placeholder="₹ 0.00"
              className="text-right"
            />
          </div>

          {/* Totals */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Paid:</span>
              <span className={`text-lg font-bold ${totalPaid > billAmount ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Balance:</span>
              <span className={`text-lg font-bold ${balanceAmount > 0 ? 'text-red-600' : balanceAmount < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(balanceAmount))}
                {balanceAmount < 0 && ' (Excess)'}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={totalPaid <= 0}
          >
            Save & Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
