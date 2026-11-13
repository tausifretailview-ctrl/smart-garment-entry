import { Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PurchaseSavedPrintDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Labels on the whole saved bill. */
  totalLabels: number;
  /** Lines were added in this edit (shows the "Newly Added" count and Print New Only). */
  hasNewLines: boolean;
  /** Labels on the lines added in this edit. */
  newLabels: number;
  /** Lines ticked for printing (0 = print all). */
  selectedCount: number;
  onPrintAll: () => void;
  onPrintNew: () => void;
  onContinueAdding: () => void;
};

/**
 * "Bill Saved Successfully" dialog after a purchase save: label counts, Print All / Selected,
 * Print New Only, Continue Adding Products and Skip. Moved out of PurchaseEntry.tsx unchanged
 * (Plan Phase 4, S4); the printing itself stays in PurchaseEntry.
 */
export function PurchaseSavedPrintDialog({
  open,
  onOpenChange,
  totalLabels,
  hasNewLines,
  newLabels,
  selectedCount,
  onPrintAll,
  onPrintNew,
  onContinueAdding,
}: PurchaseSavedPrintDialogProps) {
  const hasNew = hasNewLines;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Bill Saved Successfully
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Your purchase bill has been saved. Would you like to print barcodes?
          </p>

          {/* Show item counts */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Items:</span>
              <span className="font-semibold">{totalLabels} labels</span>
            </div>
            {hasNew && (
              <div className="flex justify-between text-primary">
                <span>Newly Added:</span>
                <span className="font-semibold">{newLabels} labels</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={onPrintAll} className="w-full gap-2">
              <Printer className="h-4 w-4" />
              {selectedCount > 0 ? `Print Selected (${selectedCount})` : `Print All Labels (${totalLabels})`}
            </Button>

            {hasNew && (
              <Button variant="secondary" onClick={onPrintNew} className="w-full gap-2">
                <Printer className="h-4 w-4" />
                Print New Only ({newLabels})
              </Button>
            )}

            <Button variant="secondary" onClick={onContinueAdding} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Continue Adding Products
            </Button>

            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Skip
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
