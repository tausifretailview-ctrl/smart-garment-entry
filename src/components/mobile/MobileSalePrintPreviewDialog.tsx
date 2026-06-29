import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchSaleForInvoicePreview } from "@/utils/mobileInvoicePreviewData";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { Loader2 } from "lucide-react";

type Props = {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileSalePrintPreviewDialog({ saleId, open, onOpenChange }: Props) {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const [billFormat, setBillFormat] = useState<"a4" | "a5" | "a5-horizontal" | "thermal">("a4");

  useEffect(() => {
    const saleSettings = settings?.sale_settings as { bill_format?: string } | undefined;
    const fmt = saleSettings?.bill_format || "a4";
    setBillFormat(fmt as typeof billFormat);
  }, [settings]);

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
  } | undefined;

  const invoiceTemplate = saleSettings?.invoice_template || "professional";
  const wrapperFormat = billFormat === "a5" ? "a5-vertical" : billFormat;

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
      renderInvoice={(format) => (
        <InvoiceWrapper {...invoiceProps} format={format as typeof invoiceProps.format} />
      )}
    />
  );
}
