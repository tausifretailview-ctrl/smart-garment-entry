import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchSaleForInvoicePreview } from "@/utils/mobileInvoicePreviewData";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import {
  resolvePosBillFormat,
  resolvePosThermalPaper,
  toInvoiceWrapperFormat,
  type PosBillFormat,
} from "@/utils/invoicePrintFormat";
import { Loader2 } from "lucide-react";

type Props = {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true (mobile POS), prefer sale_settings.pos_bill_format over sale bill_format. */
  preferPosFormat?: boolean;
  /** After preview loads, auto Save/Share PDF once (post-save flow). */
  autoDeliverPdf?: boolean;
};

export function MobileSalePrintPreviewDialog({
  saleId,
  open,
  onOpenChange,
  preferPosFormat = false,
  autoDeliverPdf = false,
}: Props) {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const [billFormat, setBillFormat] = useState<"a4" | "a5" | "a5-horizontal" | "thermal">(
    preferPosFormat ? "thermal" : "a4",
  );

  useEffect(() => {
    const saleSettings = settings?.sale_settings as {
      bill_format?: string;
      pos_bill_format?: string;
      invoice_template?: string;
      invoice_paper_format?: string;
    } | undefined;
    if (preferPosFormat) {
      const template = saleSettings?.invoice_template || "professional";
      const raw = (saleSettings?.pos_bill_format || "thermal") as PosBillFormat;
      const resolved = resolvePosBillFormat(template, raw, saleSettings?.invoice_paper_format);
      setBillFormat(resolved);
    } else {
      const fmt = saleSettings?.bill_format || "a4";
      setBillFormat(fmt as typeof billFormat);
    }
  }, [settings, preferPosFormat]);

  const { data: sale, isLoading, isError } = useQuery({
    queryKey: ["mobile-invoice-preview", currentOrganization?.id, saleId],
    queryFn: () =>
      withMobileQueryTimeout(() =>
        fetchSaleForInvoicePreview(saleId!, currentOrganization!.id),
      ),
    enabled: open && !!saleId && !!currentOrganization?.id,
    staleTime: 60_000,
    retry: 1,
  });

  const saleSettings = settings?.sale_settings as {
    invoice_template?: string;
    show_mrp_column?: boolean;
    show_hsn_column?: boolean;
    bill_format?: string;
    pos_bill_format?: string;
    invoice_paper_format?: string;
  } | undefined;

  const billBarcodeSettings = (
    settings as { bill_barcode_settings?: { direct_print_pos_paper?: string } } | null
  )?.bill_barcode_settings;

  const invoiceTemplate = saleSettings?.invoice_template || "professional";
  const wrapperFormat = preferPosFormat
    ? toInvoiceWrapperFormat(billFormat)
    : billFormat === "a5"
      ? "a5-vertical"
      : billFormat;
  const thermalPaper = resolvePosThermalPaper(billBarcodeSettings?.direct_print_pos_paper);

  const invoiceProps = useMemo(() => {
    if (!sale) return null;
    return {
      format: wrapperFormat as "a4" | "a5-vertical" | "a5-horizontal" | "thermal",
      billNo: sale.sale_number,
      date: new Date(sale.sale_date),
      customerName: sale.customer_name,
      customerAddress: sale.customer_address || "",
      customerMobile: sale.customer_phone || "",
      customerGSTIN: sale.customers?.gst_number || "",
      template: invoiceTemplate,
      showMRP: saleSettings?.show_mrp_column ?? false,
      showHSN: saleSettings?.show_hsn_column ?? true,
      items: sale.sale_items.map((item, index) => ({
        sr: index + 1,
        particulars: item.product_name,
        size: item.size,
        barcode: item.barcode || "",
        hsn: item.hsn_code || "",
        sp: item.mrp,
        mrp: item.mrp,
        qty: item.quantity,
        rate: item.unit_price,
        total: item.line_total,
        color: item.color || item.products?.color || "",
        brand: item.products?.brand || "",
        style: item.products?.style || "",
        gstPercent: item.gst_percent || 0,
        discountPercent: item.discount_percent || 0,
        itemNotes: item.item_notes || "",
      })),
      subTotal: sale.gross_amount,
      discount: (sale.discount_amount || 0) + (sale.flat_discount_amount || 0),
      saleReturnAdjust: sale.sale_return_adjust || 0,
      grandTotal: sale.net_amount,
      paymentMethod: sale.payment_method,
      salesman: sale.salesman || "",
      notes: sale.notes || "",
    };
  }, [sale, wrapperFormat, invoiceTemplate, saleSettings]);

  if (!open || !saleId) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading invoice preview…</p>
        </div>
      </div>
    );
  }

  if (isError || !sale || !invoiceProps) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-6">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium">Could not load invoice preview</p>
          <button
            type="button"
            className="text-sm text-primary font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <PrintPreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      defaultFormat={billFormat}
      thermalPaper={thermalPaper}
      autoDeliverPdf={autoDeliverPdf}
      renderInvoice={(format) => (
        <InvoiceWrapper {...invoiceProps} format={format as typeof invoiceProps.format} />
      )}
    />
  );
}
