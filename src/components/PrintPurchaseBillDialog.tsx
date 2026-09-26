import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  onClose,
}: {
  bill: PurchaseBillPrintBill;
  items: PurchaseBillPrintLineInput[];
  settings?: SettingsLike | null;
  organizationId?: string | null;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [itemLayout, setItemLayout] = useState<PurchaseBillPdfItemLayout>(() =>
    readPurchaseBillPdfItemLayout(organizationId),
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const printLines = mapPurchaseItemsToPrintLines(items);
  const billLabel = bill.software_bill_no || bill.supplier_invoice_no || "Purchase Bill";

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
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
  });

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      await new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      });
      await downloadPurchaseBillPDF(printRef, billLabel, "a4");
    } catch (error) {
      console.error("Purchase bill PDF download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="print-dialog max-w-4xl max-h-[90vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Purchase Bill · {billLabel}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <Label className="text-foreground shrink-0">Item layout:</Label>
                <Select
                  value={itemLayout}
                  onValueChange={(v: PurchaseBillPdfItemLayout) => setItemLayout(v)}
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
                Your choice is remembered for this organization on this device.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="border rounded-lg overflow-auto max-h-[58vh] bg-white">
          {printLines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No line items on this bill.</div>
          ) : (
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
          )}
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel type="button">Close</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDownloadPDF()}
            disabled={isDownloading || printLines.length === 0}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
          <Button type="button" onClick={() => handlePrint()} disabled={printLines.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
