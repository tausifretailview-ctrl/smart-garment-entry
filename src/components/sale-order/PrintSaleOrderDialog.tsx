import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { SaleOrderPrint } from "@/components/SaleOrderPrint";
import { ThermalPrint80mm } from "@/components/ThermalPrint80mm";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { cn } from "@/lib/utils";
import { resolveSaleBillFormatFromSaleSettings } from "@/utils/invoicePrintFormat";

/**
 * Sale order print / PDF dialog (order, or the available-stock pick list). Shared by the Sale
 * Order dashboard and Dispatch.
 */
export interface ConversionItem {
  id: string;
  product_name: string;
  size: string;
  order_qty: number;
  pending_qty: number;
  stock_qty: number;
  /** Total on-hand across all variant rows of same product+colour+size (multiple barcodes/batches). */
  total_stock_qty?: number;
  size_stock?: { size: string; qty: number }[];
  convert_qty: number;
  selected: boolean;
  variant_id: string;
  product_id: string;
  unit_price: number;
  mrp: number;
  discount_percent: number;
  gst_percent: number;
  barcode: string;
  color?: string;
  brand?: string | null;
  style?: string | null;
  uom?: string;
  hsn_code?: string;
}

type SaleOrderPrintPaper = "a4" | "a5" | "a5-horizontal" | "thermal";

function saleOrderDialogPaper(
  saleSettings?: Parameters<typeof resolveSaleBillFormatFromSaleSettings>[0],
): SaleOrderPrintPaper {
  const f = resolveSaleBillFormatFromSaleSettings(saleSettings);
  if (f === "a5-horizontal") return "a5-horizontal";
  if (f === "a5" || (f as string) === "a5-vertical") return "a5";
  if (f === "thermal") return "thermal";
  return "a4";
}

async function downloadSaleOrderPDF(
  printRef: React.RefObject<HTMLDivElement>,
  orderNumber: string,
  paper: SaleOrderPrintPaper,
) {
  const { default: html2canvas } = await import("html2canvas");
  const { default: jsPDF } = await import("jspdf");

  const element = printRef.current;
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const pageW =
    paper === "a4" ? 210 : paper === "a5-horizontal" ? 210 : paper === "thermal" ? 80 : 148;
  const pageH =
    paper === "a4"
      ? 297
      : paper === "a5-horizontal"
        ? 148
        : paper === "thermal"
          ? (imgHeight * pageW) / imgWidth
          : 210;
  const landscape = pageW > pageH;
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: paper === "thermal" ? [pageW, pageH] : [pageW, pageH],
  });

  const pageHeightPx = (pageH / pageW) * imgWidth;
  if (imgHeight <= pageHeightPx + 2) {
    pdf.addImage(imgData, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
  } else {
    let y = 0;
    let page = 0;
    while (y < imgHeight) {
      if (page > 0) pdf.addPage([pageW, pageH], landscape ? "landscape" : "portrait");
      const sliceH = Math.min(pageHeightPx, imgHeight - y);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = imgWidth;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, imgWidth, sliceH);
        ctx.drawImage(canvas, 0, y, imgWidth, sliceH, 0, 0, imgWidth, sliceH);
        const sliceHMm = (sliceH / imgWidth) * pageW;
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, pageW, sliceHMm, undefined, "FAST");
      }
      y += pageHeightPx;
      page += 1;
    }
  }

  pdf.save(`SaleOrder-${orderNumber}.pdf`);
}

// Print Dialog Component
export function PrintSaleOrderDialog({
  order,
  settings,
  onClose,
  mode = "order",
  conversionItems,
  printedAt,
}: {
  order: any;
  settings: any;
  onClose: () => void;
  mode?: "order" | "available-stock";
  conversionItems?: ConversionItem[];
  printedAt?: Date;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printItems, setPrintItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const isAvailableStock = mode === "available-stock";
  const [selectedFormat, setSelectedFormat] = useState<SaleOrderPrintPaper>(() => {
    if (mode === "available-stock") return "a4";
    return saleOrderDialogPaper(settings?.sale_settings);
  });
  const [invoiceStyle, setInvoiceStyle] = useState<"standard" | "wholesale-size-grouping">(
    isAvailableStock ? "standard" : "wholesale-size-grouping",
  );
  
  const getPageStyle = () => {
    if (isAvailableStock) {
      return '@page { size: A4 landscape; margin: 6mm; }';
    }
    switch (selectedFormat) {
      case 'a5':
        return '@page { size: 148mm 210mm; margin: 4mm; }';
      case 'a5-horizontal':
        return '@page { size: 210mm 148mm; margin: 4mm; }';
      case 'thermal':
        return '@page { size: 80mm auto; margin: 2mm 4mm; }';
      default:
        return '@page { size: A4 portrait; margin: 10mm; }';
    }
  };
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: isAvailableStock
      ? `AvailableStock-${order.order_number}`
      : `SaleOrder-${order.order_number}`,
    pageStyle: `${getPageStyle()}
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
      @media print {
        body .sale-order-print-container,
        body .sale-order-print-container * {
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
      const paper: SaleOrderPrintPaper = isAvailableStock ? "a4" : selectedFormat;
      await downloadSaleOrderPDF(printRef as React.RefObject<HTMLDivElement>, order.order_number, paper);
    } catch (error) {
      console.error("Sale order PDF download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Fetch brand/style from products (and map available-stock rows from conversion)
  useEffect(() => {
    const fetchProductDetails = async () => {
      const sourceRows = isAvailableStock
        ? (conversionItems || [])
        : (order.sale_order_items || []).filter((item: any) => !item.deleted_at);

      const productIds = [
        ...new Set(
          sourceRows
            .map((item: any) => item.product_id)
            .filter(Boolean),
        ),
      ] as string[];
      let productDetails: Record<string, { brand: string | null; style: string | null }> = {};
      
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, brand, style")
          .in("id", productIds);
        
        if (products) {
          productDetails = products.reduce((acc, p) => {
            acc[p.id] = { brand: p.brand, style: p.style };
            return acc;
          }, {} as Record<string, { brand: string | null; style: string | null }>);
        }
      }

      const items = isAvailableStock
        ? (conversionItems || []).map((item, index) => ({
            sr: index + 1,
            particulars: item.product_name,
            size: item.size,
            barcode: item.barcode || "",
            hsn: "",
            orderQty: item.order_qty,
            fulfilledQty: Math.max(0, item.order_qty - item.pending_qty),
            pendingQty: item.pending_qty,
            availableQty: item.total_stock_qty ?? item.stock_qty,
            stockQty: item.total_stock_qty ?? item.stock_qty,
            sizeStock: item.size_stock ?? [],
            rate: item.unit_price,
            mrp: item.mrp,
            discountPercent: item.discount_percent,
            total: 0,
            color: item.color || "",
            brand: item.brand ?? (item.product_id ? productDetails[item.product_id]?.brand : null),
            style: item.style ?? (item.product_id ? productDetails[item.product_id]?.style : null),
          }))
        : (order.sale_order_items || [])
            .filter((item: any) => !item.deleted_at)
            .map((item: any, index: number) => ({
              sr: index + 1,
              particulars: item.product_name,
              size: item.size,
              barcode: item.barcode || "",
              hsn: "",
              orderQty: item.order_qty,
              fulfilledQty: item.fulfilled_qty,
              pendingQty: item.pending_qty,
              rate: item.unit_price,
              mrp: item.mrp,
              discountPercent: item.discount_percent,
              total: item.line_total,
              color: item.color || "",
              brand: item.product_id ? productDetails[item.product_id]?.brand : null,
              style: item.product_id ? productDetails[item.product_id]?.style : null,
            }));
      
      setPrintItems(items);
      setLoading(false);
    };

    fetchProductDetails();
  }, [order, conversionItems, isAvailableStock]);

  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent className={cn("print-dialog max-h-[90vh] overflow-auto", isAvailableStock ? "max-w-6xl" : "max-w-4xl")}>
          <AlertDialogHeader>
          <AlertDialogTitle>
            {isAvailableStock ? "Print Available Stock" : "Print Sale Order"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {!isAvailableStock && (
              <div className="flex items-center gap-2">
                <Label className="text-foreground">Bill Format:</Label>
                <Select
                  value={selectedFormat}
                  onValueChange={(v: 'a4' | 'a5' | 'a5-horizontal' | 'thermal') => {
                    setSelectedFormat(v);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                    <SelectItem value="a5">A5 Vertical (148mm × 210mm)</SelectItem>
                    <SelectItem value="a5-horizontal">A5 Horizontal (210mm × 148mm)</SelectItem>
                    <SelectItem value="thermal">Thermal (80mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )}
              {!isAvailableStock && selectedFormat !== 'thermal' && (
                <div className="flex items-center gap-2">
                  <Label className="text-foreground">Invoice Style:</Label>
                  <Select value={invoiceStyle} onValueChange={(v: "standard" | "wholesale-size-grouping") => setInvoiceStyle(v)}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="wholesale-size-grouping">Modern Wholesale Size Grouping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isAvailableStock && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Picking list prints on A4 landscape. Each cell is Avl / Ord only for sizes with order qty. Snapshot of on-hand stock, not a reservation. No prices.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : printItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-destructive font-medium">No items found for this order</p>
              <p className="text-sm text-muted-foreground mt-2">
                This order may have been created without items. Please re-create the order.
              </p>
            </div>
          ) : selectedFormat === 'thermal' && !isAvailableStock ? (
            <ThermalPrint80mm
              ref={printRef}
              billNo={order.order_number}
              date={new Date(order.order_date)}
              customerName={order.customer_name}
              customerPhone={order.customer_phone}
              customerAddress={order.customer_address}
              items={printItems.map((item: any, idx: number) => ({
                sr: idx + 1,
                particulars: item.particulars,
                qty: item.orderQty,
                rate: item.rate,
                total: item.total,
              }))}
              subTotal={order.gross_amount}
              discount={order.discount_amount + order.flat_discount_amount}
              grandTotal={order.net_amount}
              gstBreakdown={{
                cgst: order.gst_amount / 2,
                sgst: order.gst_amount / 2,
              }}
              documentType="sale-order"
              termsConditions={order.terms_conditions}
            />
          ) : (
            <SaleOrderPrint
              ref={printRef}
              businessName={settings?.business_name || 'Business Name'}
              address={settings?.address || ''}
              mobile={settings?.mobile_number || ''}
              email={settings?.email_id}
              gstNumber={settings?.gst_number}
              logoUrl={settings?.bill_barcode_settings?.logo_url}
              orderNumber={order.order_number}
              orderDate={new Date(order.order_date)}
              expectedDeliveryDate={order.expected_delivery_date ? new Date(order.expected_delivery_date) : undefined}
              quotationNumber={order.quotation_id ? `Linked` : undefined}
              customerName={order.customer_name}
              customerAddress={order.customer_address}
              customerMobile={order.customer_phone}
              customerEmail={order.customer_email}
              items={printItems}
              grossAmount={isAvailableStock ? 0 : order.gross_amount}
              discountAmount={isAvailableStock ? 0 : order.discount_amount + order.flat_discount_amount}
              taxableAmount={isAvailableStock ? 0 : order.gross_amount - order.discount_amount - order.flat_discount_amount}
              gstAmount={isAvailableStock ? 0 : order.gst_amount}
              roundOff={isAvailableStock ? 0 : order.round_off}
              netAmount={isAvailableStock ? 0 : order.net_amount}
              status={order.status}
              termsConditions={order.terms_conditions}
              notes={order.notes}
              shippingAddress={order.shipping_address}
              taxType={order.tax_type}
              format={isAvailableStock ? 'a4' : selectedFormat === 'a5' ? 'a5-vertical' : selectedFormat === 'a5-horizontal' ? 'a5-horizontal' : 'a4'}
              colorScheme={settings?.sale_settings?.invoice_color_scheme || 'blue'}
              invoiceFormat={isAvailableStock ? "standard" : invoiceStyle}
              documentMode={isAvailableStock ? "available-stock" : "order"}
              printedAt={isAvailableStock ? (printedAt || new Date()) : undefined}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button variant="outline" onClick={() => void handleDownloadPDF()} disabled={loading || isDownloading || printItems.length === 0}>
            {isDownloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
          <Button onClick={() => handlePrint()} disabled={loading || printItems.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            {loading ? "Loading..." : "Print"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
