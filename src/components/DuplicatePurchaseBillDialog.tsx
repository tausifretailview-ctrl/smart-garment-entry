import { useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

export interface ExistingDuplicateBill {
  id: string;
  software_bill_no: string;
  supplier_name: string;
  supplier_invoice_no: string | null;
  bill_date: string;
  net_amount: number;
  created_at: string;
}

interface DuplicatePurchaseBillDialogProps {
  open: boolean;
  onClose: () => void;
  existingBill: ExistingDuplicateBill | null;
  matchReason: string;
  canOverride: boolean;
  onOpenExisting: (billId: string) => void;
  onSaveAnyway: () => Promise<void> | void;
}

export const DuplicatePurchaseBillDialog = ({
  open,
  onClose,
  existingBill,
  matchReason,
  canOverride,
  onOpenExisting,
  onSaveAnyway,
}: DuplicatePurchaseBillDialogProps) => {
  const [saving, setSaving] = useState(false);

  if (!existingBill) return null;

  const handleSaveAnyway = async () => {
    setSaving(true);
    try {
      await onSaveAnyway();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Possible Duplicate Purchase Bill
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-foreground">
                A bill that looks identical to this one already exists. Saving again will <b>double-count stock</b>.
              </p>
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Bill No</span><span className="font-semibold">{existingBill.software_bill_no}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{existingBill.supplier_name}</span></div>
                {existingBill.supplier_invoice_no && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Supplier Inv No</span><span className="font-medium">{existingBill.supplier_invoice_no}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Bill Date</span><span>{format(new Date(existingBill.bill_date), "dd-MMM-yyyy")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Net Amount</span><span className="font-semibold">₹{Math.round(existingBill.net_amount).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Saved On</span><span>{format(new Date(existingBill.created_at), "dd-MMM-yyyy HH:mm")}</span></div>
              </div>
              <p className="text-xs text-muted-foreground"><b>Match:</b> {matchReason}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="secondary" onClick={() => onOpenExisting(existingBill.id)} disabled={saving} className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Open Existing
          </Button>
          {canOverride && (
            <Button variant="destructive" onClick={handleSaveAnyway} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save Anyway"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
