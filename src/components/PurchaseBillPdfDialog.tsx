import { useRef } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { waitForPrintReady } from "@/utils/printReady";
import {
  PurchaseBillPrint,
  type PurchaseBillPrintBill,
  type PurchaseBillPrintItem,
} from "@/components/PurchaseBillPrint";

interface PurchaseBillPdfDialogProps {
  bill: PurchaseBillPrintBill | null;
  items: PurchaseBillPrintItem[];
  loading: boolean;
  business: { name: string; address: string; mobile: string; email: string; gst: string };
  onClose: () => void;
}

/**
 * Bill-details preview + browser print (Save as PDF) for one purchase bill.
 * Mirrors the Sale Order print dialog pattern.
 */
export function PurchaseBillPdfDialog({ bill, items, loading, business, onClose }: PurchaseBillPdfDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: bill ? `PurchaseBill-${bill.software_bill_no || bill.supplier_invoice_no || "bill"}` : "PurchaseBill",
    pageStyle: "@page { size: A4 portrait; margin: 10mm; }",
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
  });

  return (
    <Dialog open={bill !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Purchase Bill {bill ? `· ${bill.software_bill_no || bill.supplier_invoice_no || ""}` : ""}
          </DialogTitle>
        </DialogHeader>
        {loading || !bill ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading bill details…
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <PurchaseBillPrint
              ref={printRef}
              businessName={business.name}
              address={business.address}
              mobile={business.mobile}
              email={business.email}
              gstNumber={business.gst}
              bill={bill}
              items={items}
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => handlePrint()} disabled={loading || !bill}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
