import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchSaleForInvoicePreview } from "@/utils/mobileInvoicePreviewData";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import {
  resolvePosThermalPaper,
  resolveSalePreviewPrintConfig,
  toInvoiceWrapperFormat,
  type PosBillFormat,
} from "@/utils/invoicePrintFormat";

type SaleHint = {
  sale_type?: string | null;
  sale_number?: string | null;
};

type Props = {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets the dialog pick POS vs Sale paper before the sale row finishes loading. */
  saleHint?: SaleHint | null;
};

export function MobileSalePrintPreviewDialog({ saleId, open, onOpenChange, saleHint }: Props) {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const [billFormat, setBillFormat] = useState<PosBillFormat>("thermal");

  const saleSettings = settings?.sale_settings as {
    invoice_template?: string;
    pos_invoice_template?: string;
    show_mrp_column?: boolean;
    show_hsn_column?: boolean;
    pos_bill_format?: string;
    sales_bill_format?: string;
    invoice_paper_format?: string;
  } | undefined;

  const { data: sale, isLoading, isError, refetch } = useQuery({
    queryKey: ["mobile-invoice-preview", currentOrganization?.id, saleId],
    queryFn: () =>
      withMobileQueryTimeout(() =>
        fetchSaleForInvoicePreview(saleId!, currentOrganization!.id),
      ),
    enabled: open && !!saleId && !!currentOrganization?.id,
    staleTime: 60_000,
    retry: 1,
  });

  const previewConfig = useMemo(
    () =>
      resolveSalePreviewPrintConfig(
        {
          sale_type: sale?.sale_type ?? saleHint?.sale_type,
          sale_number: sale?.sale_number ?? saleHint?.sale_number,
        },
        saleSettings,
      ),
    [sale?.sale_type, sale?.sale_number, saleHint?.sale_type, saleHint?.sale_number, saleSettings],
  );

  useEffect(() => {
    setBillFormat(previewConfig.paperFormat);
  }, [previewConfig.paperFormat]);

  const thermalPaper = resolvePosThermalPaper(
    (settings as { bill_barcode_settings?: { direct_print_pos_paper?: string } } | null)
      ?.bill_barcode_settings?.direct_print_pos_paper,
  );

  const invoiceProps = useMemo(() => {
    if (!sale) return null;
    const cashAmount = Number(sale.cash_amount || 0);
    const upiAmount = Number(sale.upi_amount || 0);
    const cardAmount = Number(sale.card_amount || 0);
    const creditAmount = Number(sale.credit_amount || 0);
    return {
      format: toInvoiceWrapperFormat(billFormat) as
        | "a4"
        | "a5-vertical"
        | "a5-horizontal"
        | "thermal",
      billNo: sale.sale_number,
      date: new Date(sale.sale_date),
      customerName: sale.customer_name,
      customerAddress: sale.customer_address || "",
      customerMobile: sale.customer_phone || "",
      customerGSTIN: sale.customers?.gst_number || "",
      template: previewConfig.template,
      thermalPaper,
      documentType: previewConfig.documentType,
      showMRP: saleSettings?.show_mrp_column ?? false,
      showHSN: saleSettings?.show_hsn_column ?? true,
      items: sale.sale_items.map((item, index) => ({
        sr: index + 1,
        particulars: item.product_name,
        size: item.size || "",
        barcode: item.barcode || "",
        hsn: item.hsn_code || "",
        sp: item.mrp ?? item.unit_price ?? 0,
        mrp: item.mrp ?? item.unit_price ?? 0,
        qty: item.quantity || 0,
        rate: item.unit_price || 0,
        total: item.line_total || 0,
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
      roundOff: sale.round_off || 0,
      paymentMethod: sale.payment_method,
      cashAmount,
      cardAmount,
      upiAmount,
      creditAmount,
      cashPaid: cashAmount,
      upiPaid: upiAmount,
      paidAmount: sale.paid_amount || 0,
      salesman: sale.salesman || "",
      notes: sale.notes || "",
    };
  }, [sale, billFormat, previewConfig.template, previewConfig.documentType, saleSettings, thermalPaper]);

  if (!open || !saleId) return null;

  return (
    <PrintPreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      compactLayout
      defaultFormat={billFormat}
      thermalPaper={thermalPaper}
      renderInvoice={(format) => {
        if (isLoading) {
          return (
            <div data-invoice-loading className="p-6 text-sm text-muted-foreground">
              Loading preview…
            </div>
          );
        }
        if (isError || !invoiceProps) {
          return (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm font-medium">Could not load invoice preview</p>
              <button
                type="button"
                className="text-sm text-primary font-semibold touch-manipulation"
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </div>
          );
        }
        return <InvoiceWrapper {...invoiceProps} format={format as typeof invoiceProps.format} />;
      }}
    />
  );
}
