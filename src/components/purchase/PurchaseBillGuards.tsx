import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/*
 * Purchase Entry's lock banner and the three "are you sure" dialogs around saving / editing a
 * bill. Moved out of PurchaseEntry.tsx unchanged (Plan Phase 4, S4); what each button does stays
 * in PurchaseEntry and comes in as a callback.
 */

/** "Bill is Locked" strip with the Unlock Bill button. */
export function PurchaseLockedBanner({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg mx-4 mt-2">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Bill is Locked</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">This purchase bill is locked. Unlock to make changes.</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100"
        onClick={onUnlock}
      >
        <LockOpen className="h-3.5 w-3.5 mr-1.5" />
        Unlock Bill
      </Button>
    </div>
  );
}

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Confirm unlocking a locked bill for editing. */
export function PurchaseUnlockDialog({ open, onOpenChange, onConfirm }: DialogProps & { onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5 text-amber-600" />
            Unlock Purchase Bill?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This bill is locked to prevent accidental changes. Unlocking will allow editing.
            You can lock it again from the Purchase Bills dashboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={onConfirm}>
            <LockOpen className="h-4 w-4 mr-1.5" />
            Unlock & Edit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Same supplier, date and amount already saved: save another one anyway? */
export function PurchaseDuplicateBillDialog({
  open,
  onOpenChange,
  duplicate,
  onSaveAnyway,
}: DialogProps & {
  /** The existing bill, when known. */
  duplicate: { bill_no: string; bill_date: string } | null | undefined;
  onSaveAnyway: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Possible Duplicate Bill
          </AlertDialogTitle>
          <AlertDialogDescription>
            A purchase bill with the same supplier, date, and amount already exists
            {duplicate ? ` (Bill: ${duplicate.bill_no}, Date: ${duplicate.bill_date})` : ""}.
            Are you sure you want to save another bill?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={onSaveAnyway}>
            Save Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Lines with a duplicate barcode: review them, or save anyway. */
export function PurchaseBarcodeConflictDialog({
  open,
  onOpenChange,
  conflictCount,
  onSaveAnyway,
}: DialogProps & { conflictCount: number; onSaveAnyway: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Duplicate Barcode Detected
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                {conflictCount === 1
                  ? "1 line item has a barcode conflict"
                  : `${conflictCount} line items have barcode conflicts`}
                {" "}(duplicate in this bill or already used on another product).
              </p>
              <p className="text-muted-foreground">
                Review the amber/red warnings under the BARCODE column. Saving with duplicate barcodes can cause stock and billing errors.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Review Items</AlertDialogCancel>
          <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={onSaveAnyway}>
            Save Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
