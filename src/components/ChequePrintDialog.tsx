import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChequeFormats } from "@/hooks/useChequeFormats";
import { ChequePrintPreview } from "@/components/ChequePrintPreview";
import { Printer, Settings } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";

interface ChequePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payeeName: string;
  amount: number;
  chequeDate: Date;
  chequeNumber?: string;
  onPrinted?: () => void;
}

export function ChequePrintDialog({
  open,
  onOpenChange,
  payeeName,
  amount,
  chequeDate,
  chequeNumber,
  onPrinted,
}: ChequePrintDialogProps) {
  const { formats, defaultFormat, isLoading } = useChequeFormats();
  const [selectedFormatId, setSelectedFormatId] = useState<string | undefined>(defaultFormat?.id);
  const printRef = useRef<HTMLDivElement>(null);

  const selectedFormat = formats.find((f) => f.id === selectedFormatId) || defaultFormat;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Cheque_${chequeNumber || payeeName}_${amount}`,
    onAfterPrint: () => {
      toast.success("Cheque printed successfully");
      onPrinted?.();
      onOpenChange(false);
    },
  });

  if (!selectedFormat && !isLoading && formats.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Cheque Formats Configured</DialogTitle>
            <DialogDescription>
              Please configure at least one bank cheque format in Settings → Cheque Printing before printing cheques.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Cheque
          </DialogTitle>
          <DialogDescription>
            Preview and print cheque for {payeeName} - ₹{amount.toLocaleString("en-IN")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bank Format Selection */}
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label>Bank Format</Label>
              <Select
                value={selectedFormatId}
                onValueChange={setSelectedFormatId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank format" />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((format) => (
                    <SelectItem key={format.id} value={format.id}>
                      {format.bank_name}
                      {format.account_number && ` (${format.account_number})`}
                      {format.is_default && " ★"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cheque Details */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Payee Name</Label>
              <p className="font-medium">{payeeName}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Amount</Label>
              <p className="font-medium">₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cheque Date</Label>
              <p className="font-medium">{chequeDate.toLocaleDateString("en-IN")}</p>
            </div>
            {chequeNumber && (
              <div>
                <Label className="text-xs text-muted-foreground">Cheque Number</Label>
                <p className="font-medium">{chequeNumber}</p>
              </div>
            )}
          </div>

          {/* Cheque Preview */}
          {selectedFormat && (
            <div className="border rounded-lg p-4 bg-card overflow-auto">
              <Label className="text-sm text-muted-foreground mb-2 block">Preview</Label>
              <div className="flex justify-center">
                <ChequePrintPreview
                  ref={printRef}
                  payeeName={payeeName}
                  amount={amount}
                  chequeDate={chequeDate}
                  chequeFormat={selectedFormat}
                  showPreview={true}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => handlePrint()} disabled={!selectedFormat}>
            <Printer className="h-4 w-4 mr-2" />
            Print Cheque
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
