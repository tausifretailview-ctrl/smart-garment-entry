import { useRef, useState } from "react";
import { FileDown, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  // True while the print pipeline (ready-wait + system dialog) is in flight, so a
  // silent stall looks like a stall instead of a dead button.
  const [printing, setPrinting] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: bill ? `PurchaseBill-${bill.software_bill_no || bill.supplier_invoice_no || "bill"}` : "PurchaseBill",
    pageStyle: "@page { size: A4 portrait; margin: 10mm; }",
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        setPrinting(true);
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
    onAfterPrint: () => setPrinting(false),
    onPrintError: (_location, error) => {
      setPrinting(false);
      toast({
        title: "Print failed",
        description: error instanceof Error ? error.message : "The print dialog could not be opened. Use Download HTML instead.",
        variant: "destructive",
      });
    },
  });

  const downloadHtml = () => {
    const node = printRef.current;
    if (!node || !bill) return;
    const title = `PurchaseBill-${bill.software_bill_no || bill.supplier_invoice_no || "bill"}`;
    const html =
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>@page{size:A4 portrait;margin:10mm}body{margin:0;background:#fff}</style>` +
      `</head><body>${node.outerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

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
          <Button variant="outline" onClick={downloadHtml} disabled={loading || !bill} title="Save the bill as an HTML file you can open and print anywhere">
            <FileDown className="h-4 w-4 mr-2" />
            Download HTML
          </Button>
          <Button
            onClick={() => {
              setPrinting(true);
              void Promise.resolve()
                .then(() => handlePrint())
                .catch((err: unknown) => {
                  setPrinting(false);
                  toast({
                    title: "Print failed",
                    description: err instanceof Error ? err.message : "The print dialog could not be opened. Use Download HTML instead.",
                    variant: "destructive",
                  });
                });
            }}
            disabled={loading || !bill || printing}
          >
            {printing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            {printing ? "Preparing print…" : "Print / Save PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
