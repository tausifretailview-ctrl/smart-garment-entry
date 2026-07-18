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
import { Banknote, CreditCard, Smartphone, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { clampMixPaymentModeAmount } from "@/utils/mixPaymentAllocation";

export type MixPaymentInitialBreakdown = {
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  bankAmount?: number;
  financeAmount?: number;
};

interface MixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billAmount: number;
  creditApplied?: number;
  /** When re-opening Mix Pay on an edited POS invoice, prefill tender rows from DB / saved snapshot. */
  initialBreakdown?: MixPaymentInitialBreakdown | null;
  onSave: (paymentData: {
    cashAmount: number;
    cardAmount: number;
    upiAmount: number;
    bankAmount: number;
    financeAmount: number;
    creditAmount: number;
    totalPaid: number;
    refundAmount: number;
    issueCreditNote?: boolean;
    refundMode?: 'cash' | 'upi' | 'bank_transfer';
  }) => void;
}

export function MixPaymentDialog({
  open,
  onOpenChange,
  billAmount,
  creditApplied = 0,
  initialBreakdown = null,
  onSave,
}: MixPaymentDialogProps) {
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [upiAmount, setUpiAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [financeAmount, setFinanceAmount] = useState(0);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundMode, setRefundMode] = useState<'cash' | 'upi' | 'bank_transfer'>('cash');

  const isRefundMode = billAmount < 0;
  const refundRequired = Math.abs(billAmount);
  const payableBill = Math.max(0, billAmount);
  const totalPaid = cashAmount + cardAmount + upiAmount + bankAmount + financeAmount;
  const creditBalance = isRefundMode ? 0 : Math.max(0, payableBill - totalPaid);
  const balanceAmount = isRefundMode ? 0 : Math.max(0, payableBill - totalPaid);
  const exceedsBill = !isRefundMode && totalPaid > payableBill + 0.001;

  // On close: clear. On open (normal mode): restore saved mix tender from initialBreakdown (edit POS / revisit).
  useEffect(() => {
    if (!open) {
      setCashAmount(0);
      setCardAmount(0);
      setUpiAmount(0);
      setBankAmount(0);
      setFinanceAmount(0);
      setRefundAmount(0);
      setRefundMode("cash");
      return;
    }
    if (isRefundMode) {
      setRefundAmount(refundRequired);
      return;
    }
    const init = initialBreakdown;
    let cash = Math.max(0, Number(init?.cashAmount) || 0);
    let card = Math.max(0, Number(init?.cardAmount) || 0);
    let upi = Math.max(0, Number(init?.upiAmount) || 0);
    let bank = Math.max(0, Number(init?.bankAmount) || 0);
    let finance = Math.max(0, Number(init?.financeAmount) || 0);
    // Cap restored values so legacy over-tender rows cannot re-enter excess.
    cash = clampMixPaymentModeAmount(cash, 0, payableBill);
    card = clampMixPaymentModeAmount(card, cash, payableBill);
    upi = clampMixPaymentModeAmount(upi, cash + card, payableBill);
    bank = clampMixPaymentModeAmount(bank, cash + card + upi, payableBill);
    finance = clampMixPaymentModeAmount(finance, cash + card + upi + bank, payableBill);
    setCashAmount(cash);
    setCardAmount(card);
    setUpiAmount(upi);
    setBankAmount(bank);
    setFinanceAmount(finance);
  }, [open, isRefundMode, refundRequired, initialBreakdown, payableBill]);

  const setClampedCash = (raw: number) => {
    setCashAmount(
      clampMixPaymentModeAmount(raw, cardAmount + upiAmount + bankAmount + financeAmount, payableBill),
    );
  };
  const setClampedCard = (raw: number) => {
    setCardAmount(
      clampMixPaymentModeAmount(raw, cashAmount + upiAmount + bankAmount + financeAmount, payableBill),
    );
  };
  const setClampedUpi = (raw: number) => {
    setUpiAmount(
      clampMixPaymentModeAmount(raw, cashAmount + cardAmount + bankAmount + financeAmount, payableBill),
    );
  };
  const setClampedFinance = (raw: number) => {
    setFinanceAmount(
      clampMixPaymentModeAmount(raw, cashAmount + cardAmount + upiAmount + bankAmount, payableBill),
    );
  };

  const handleSave = (issueCreditNote: boolean = false) => {
    if (isRefundMode) {
      if (refundAmount <= 0) {
        return;
      }
      onSave({
        cashAmount: 0,
        cardAmount: 0,
        upiAmount: 0,
        bankAmount: 0,
        financeAmount: 0,
        creditAmount: 0,
        totalPaid: 0,
        refundAmount,
        issueCreditNote,
        refundMode,
      });
    } else {
      if (totalPaid <= 0 || exceedsBill) {
        return;
      }
      onSave({
        cashAmount,
        cardAmount,
        upiAmount,
        bankAmount,
        financeAmount,
        creditAmount: creditBalance,
        totalPaid,
        refundAmount: 0,
        issueCreditNote: false,
      });
    }

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
          <DialogTitle className={isRefundMode ? "text-orange-600" : ""}>
            {isRefundMode ? "Refund Mode - Customer Refund Required" : "Mix Payment"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bill Amount */}
          <div className={`flex items-center justify-between p-3 rounded-lg ${isRefundMode ? 'bg-orange-100 dark:bg-orange-900' : 'bg-muted'}`}>
            <span className="text-sm font-medium">Bill Amount:</span>
            <span className={`text-lg font-bold ${isRefundMode ? 'text-orange-600 dark:text-orange-400' : ''}`}>
              {formatCurrency(isRefundMode ? -(billAmount + creditApplied) : (billAmount + creditApplied))}
            </span>
          </div>

          {/* Credit Applied */}
          {creditApplied > 0 && (
            <div className="flex items-center justify-between p-3 bg-purple-100 dark:bg-purple-900 rounded-lg border border-purple-300 dark:border-purple-700">
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Credit Applied:</span>
              <span className="text-lg font-bold text-purple-700 dark:text-purple-300">-{formatCurrency(creditApplied)}</span>
            </div>
          )}

          {/* Net Payable after credit */}
          {creditApplied > 0 && !isRefundMode && (
            <div className="flex items-center justify-between p-3 bg-green-100 dark:bg-green-900 rounded-lg border border-green-300 dark:border-green-700">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Net Payable:</span>
              <span className="text-lg font-bold text-green-700 dark:text-green-300">{formatCurrency(billAmount)}</span>
            </div>
          )}

          {isRefundMode && (
            <div className="flex items-center justify-between p-3 bg-red-100 dark:bg-red-900 rounded-lg border border-red-300 dark:border-red-700">
              <span className="text-sm font-medium text-red-700 dark:text-red-300">Refund to Customer:</span>
              <span className="text-lg font-bold text-red-700 dark:text-red-300">{formatCurrency(refundRequired)}</span>
            </div>
          )}

          {isRefundMode ? (
            /* Refund Mode Selector + Amount */
            <>
              <div className="space-y-2">
                <Label>Refund Mode</Label>
                <div className="flex gap-2">
                  {(['cash', 'upi', 'bank_transfer'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRefundMode(mode)}
                      className={cn(
                        "flex-1 py-2 rounded-lg border-2 text-sm font-medium capitalize transition-all",
                        refundMode === mode
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {mode === 'bank_transfer' ? 'Bank' : mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refund" className="flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Refund Amount ({refundMode === 'bank_transfer' ? 'Bank Transfer' : refundMode.toUpperCase()})
                </Label>
                <Input
                  id="refund"
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundAmount || ""}
                  onChange={(e) => setRefundAmount(Number(e.target.value) || 0)}
                  placeholder="₹ 0.00"
                  className="text-right"
                />
              </div>
            </>
          ) : (
            <>
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
                  max={payableBill}
                  step="0.01"
                  value={cashAmount || ""}
                  onChange={(e) => setClampedCash(Number(e.target.value) || 0)}
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
                  max={payableBill}
                  step="0.01"
                  value={cardAmount || ""}
                  onChange={(e) => setClampedCard(Number(e.target.value) || 0)}
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
                  max={payableBill}
                  step="0.01"
                  value={upiAmount || ""}
                  onChange={(e) => setClampedUpi(Number(e.target.value) || 0)}
                  placeholder="₹ 0.00"
                  className="text-right"
                />
              </div>

              {/* Finance Amount */}
              <div className="space-y-2">
                <Label htmlFor="finance" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Finance
                </Label>
                <Input
                  id="finance"
                  type="number"
                  min="0"
                  max={payableBill}
                  step="0.01"
                  value={financeAmount || ""}
                  onChange={(e) => setClampedFinance(Number(e.target.value) || 0)}
                  placeholder="₹ 0.00 — financer amount"
                  className="text-right"
                />
              </div>

              {/* Credit (Balance) */}
              {creditBalance > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-700">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-amber-600" />
                    Credit (Pay Later)
                  </span>
                  <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {formatCurrency(creditBalance)}
                  </span>
                </div>
              )}

              {/* Totals */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Paid:</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatCurrency(totalPaid)}
                  </span>
                </div>
                {creditBalance > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Credit:</span>
                    <span className="text-lg font-bold text-amber-600">
                      {formatCurrency(creditBalance)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Balance:</span>
                  <span className={`text-lg font-bold ${balanceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(balanceAmount)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Payment total cannot exceed bill amount ({formatCurrency(payableBill)}).
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {isRefundMode ? (
            <>
              <Button
                onClick={() => handleSave(false)}
                disabled={refundAmount <= 0}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Process Refund
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={refundAmount <= 0}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Issue C/Note
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleSave(false)}
              disabled={totalPaid <= 0 || exceedsBill}
            >
              Save & Print
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
