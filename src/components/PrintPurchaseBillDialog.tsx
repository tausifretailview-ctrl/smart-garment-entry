import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Printer, FileDown } from "lucide-react";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { useToast } from "@/hooks/use-toast";
import { PurchaseBillPrint, type PurchaseBillPrintBill } from "@/components/PurchaseBillPrint";
import {
  mapPurchaseItemsToPrintLines,
  persistPurchaseBillPdfItemLayout,
  readPurchaseBillPdfItemLayout,
  type PurchaseBillPdfItemLayout,
  type PurchaseBillPrintLineInput,
} from "@/utils/purchaseBillPrintLayouts";
import { downloadPurchaseBillPDF } from "@/utils/purchaseBillPdfDownload";

type SettingsLike = {
  business_name?: string;
  address?: string;
  mobile_number?: string;
  email_id?: string;
  gst_number?: string;
  bill_barcode_settings?: { logo_url?: string };
};

export function PrintPurchaseBillDialog({
  bill,
  items,
  settings,
  organizationId,
  loading = false,
  onClose,
}: {
  bill: PurchaseBillPrintBill | null;
  items: PurchaseBillPrintLineInput[];
  settings?: SettingsLike | null;
  organizationId?: string | null;
  loading?: boolean;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [itemLayout, setItemLayout] = useState<PurchaseBillPdfItemLayout>(() =>
    readPurchaseBillPdfItemLayout(organizationId),
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const printLines = mapPurchaseItemsToPrintLines(items);
  const billLabel = bill?.software_bill_no || bill?.supplier_invoice_no || "Purchase Bill";

  useEffect(() => {
    persistPurchaseBillPdfItemLayout(itemLayout, organizationId);
  }, [itemLayout, organizationId]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `PurchaseBill-${billLabel}`,
    pageStyle: `@page { size: A4 portrait; margin: 8mm; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
      @media print {
        body .purchase-bill-print,
        body .purchase-bill-print * {
          visibility: visible !important;
          opacity: 1 !important;
        }
      }`,
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
        description:
          error instanceof Error
            ? error.message
            : "The print dialog could not be opened. Use Download HTML or Download PDF instead.",
        variant: "destructive",
      });
    },
  });

  const downloadHtml = () => {
    const node = printRef.current;
    if (!node || !bill) return;
    const title = `PurchaseBill-${billLabel}`;
    const html =
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>@page{size:A4 portrait;margin:8mm}body{margin:0;background:#fff}</style>` +
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

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      await new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      });
      await downloadPurchaseBillPDF(printRef, billLabel, "a4");
    } catch (error) {
      console.error("Purchase bill PDF download error:", error);
      toast({
        title: "PDF download failed",
        description: error instanceof Error ? error.message : "Try Download HTML or Print instead.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={bill !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase Bill · {billLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-foreground shrink-0">Item layout:</Label>
            <Select
              value={itemLayout}
              onValueChange={(v: PurchaseBillPdfItemLayout) => setItemLayout(v)}
              disabled={loading || !bill}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (line list)</SelectItem>
                <SelectItem value="size-grid">Size grid (wholesale)</SelectItem>
                <SelectItem value="barcode">Line list with barcode</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Layout choice is remembered for this organization on this device.
          </p>
        </div>

        {loading || !bill ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading bill details…
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <PurchaseBillPrint
              ref={printRef}
              bill={bill}
              items={printLines}
              itemLayout={itemLayout}
              businessDetails={{
                business_name: settings?.business_name,
                address: settings?.address,
                mobile_number: settings?.mobile_number,
                email_id: settings?.email_id,
                gst_number: settings?.gst_number,
              }}
              logoUrl={settings?.bill_barcode_settings?.logo_url}
            />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={downloadHtml}
            disabled={loading || !bill || printLines.length === 0}
            title="Save the bill as an HTML file you can open and print anywhere"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Download HTML
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleDownloadPDF()}
            disabled={loading || !bill || isDownloading || printLines.length === 0}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Download PDF
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
                    description:
                      err instanceof Error
                        ? err.message
                        : "The print dialog could not be opened. Use Download HTML instead.",
                    variant: "destructive",
                  });
                });
            }}
            disabled={loading || !bill || printing || printLines.length === 0}
          >
            {printing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {printing ? "Preparing print…" : "Print / Save PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
