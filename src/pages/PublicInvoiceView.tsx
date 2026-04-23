import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download, FileX } from "lucide-react";
import { format } from "date-fns";
import { useRef, useEffect, useState, useLayoutEffect } from "react";
import { useReactToPrint } from "react-to-print";
import { ProfessionalTemplate } from "@/components/invoice-templates/ProfessionalTemplate";
import { ClassicTemplate } from "@/components/invoice-templates/ClassicTemplate";
import { ModernTemplate } from "@/components/invoice-templates/ModernTemplate";
import { ModernWholesaleTemplate } from "@/components/invoice-templates/ModernWholesaleTemplate";
import { MinimalTemplate } from "@/components/invoice-templates/MinimalTemplate";
import { CompactTemplate } from "@/components/invoice-templates/CompactTemplate";
import { DetailedTemplate } from "@/components/invoice-templates/DetailedTemplate";
import { TaxInvoiceTemplate } from "@/components/invoice-templates/TaxInvoiceTemplate";
import { TallyTaxInvoiceTemplate } from "@/components/invoice-templates/TallyTaxInvoiceTemplate";
import { RetailTemplate } from "@/components/invoice-templates/RetailTemplate";
import { RetailERPTemplate } from "@/components/invoice-templates/RetailERPTemplate";
import { WholesaleA5Template } from "@/components/invoice-templates/WholesaleA5Template";
import { ThermalPrint80mm } from "@/components/ThermalPrint80mm";
import { ModernThermalReceipt80mm } from "@/components/ModernThermalReceipt80mm";

const updateMetaTags = (businessName: string, invoiceNumber: string, orgSlug?: string, logoUrl?: string) => {
  document.title = `Invoice ${invoiceNumber} - ${businessName}`;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (ogTitle) ogTitle.setAttribute('content', businessName);
  if (ogDesc) ogDesc.setAttribute('content', `Invoice ${invoiceNumber} - ${businessName}`);
  if (ogUrl && orgSlug) ogUrl.setAttribute('content', `https://app.inventoryshop.in/${orgSlug}/`);
  if (logoUrl && ogImage) ogImage.setAttribute('content', logoUrl);
  if (logoUrl && twitterImage) twitterImage.setAttribute('content', logoUrl);
};

export default function PublicInvoiceView() {
  const { saleId } = useParams<{ saleId: string }>();
  const [searchParams] = useSearchParams();
  const formatParam = searchParams.get('format');
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-invoice', saleId],
    queryFn: async () => {
      if (!saleId) return null;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-public-invoice?saleId=${saleId}`,
        { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch invoice');
      }
      return response.json();
    },
    enabled: !!saleId,
    // Always re-fetch on mount so first WhatsApp open never paints
    // a partial/cached payload missing financer/GST data.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: 2,
  });

  const sale = data?.sale;
  const settings = data?.settings;
  const organization = data?.organization;
  const financerDetails = data?.financerDetails;
  const customerExtra = data?.customerExtra;

  useEffect(() => {
    if (settings?.business_name && sale?.sale_number) {
      updateMetaTags(settings.business_name, sale.sale_number, organization?.slug, settings.invoiceLogo);
    }
  }, [settings, sale, organization]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: sale?.sale_number || "Invoice",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md text-center">
          <FileX className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invoice Not Found</h1>
          <p className="text-muted-foreground">
            The invoice you're looking for doesn't exist or has been removed.
          </p>
        </Card>
      </div>
    );
  }

  const saleItems = sale.sale_items || [];
  const template = settings?.invoice_template || 'professional';
  const thermalStyle = settings?.thermal_receipt_style || 'classic';

  // Calculate GST from item-level data
  let totalCGST = 0, totalSGST = 0, totalIGST = 0;
  const customerGSTIN = customerExtra?.gst_number || '';
  const isInterState = customerGSTIN && settings?.gst_number
    ? customerGSTIN.substring(0, 2) !== settings.gst_number.substring(0, 2)
    : false;

  saleItems.forEach((item: any) => {
    const gstPercent = item.gst_percent || 0;
    if (gstPercent > 0) {
      const taxableValue = item.line_total;
      const totalTaxOnItem = taxableValue * gstPercent / (100 + gstPercent);
      if (isInterState) {
        totalIGST += totalTaxOnItem;
      } else {
        totalCGST += totalTaxOnItem / 2;
        totalSGST += totalTaxOnItem / 2;
      }
    }
  });

  const templateProps = {
    businessName: settings?.business_name || "Business",
    address: settings?.address || "",
    mobile: settings?.mobile_number || "",
    email: settings?.email_id || "",
    gstNumber: settings?.gst_number || "",
    logoUrl: settings?.invoiceLogo || "",
    logoPlacement: settings?.logo_placement || "left",
    invoiceNumber: sale.sale_number,
    invoiceDate: new Date(sale.sale_date),
    customerName: sale.customer_name,
    customerAddress: sale.customer_address || "",
    customerMobile: sale.customer_phone || "",
    customerGSTIN,
    customerTransportDetails: customerExtra?.transport_details || "",
    salesman: sale.salesman || "",
    notes: sale.notes || "",
    items: saleItems.map((item: any, index: number) => ({
      sr: index + 1,
      barcode: item.barcode || "",
      particulars: item.product_name,
      size: item.size,
      hsn: item.hsn_code || "",
      sp: item.mrp,
      qty: item.quantity,
      rate: item.unit_price,
      total: item.line_total,
      brand: "",
      category: "",
      color: item.color || "",
      style: "",
      gstPercent: item.gst_percent || 0,
    })),
    subtotal: sale.gross_amount,
    discount: sale.discount_amount + sale.flat_discount_amount,
    taxableAmount: sale.gross_amount - sale.discount_amount - sale.flat_discount_amount,
    cgstAmount: Math.round(totalCGST * 100) / 100,
    sgstAmount: Math.round(totalSGST * 100) / 100,
    igstAmount: Math.round(totalIGST * 100) / 100,
    totalTax: Math.round((totalCGST + totalSGST + totalIGST) * 100) / 100,
    roundOff: sale.round_off,
    grandTotal: sale.net_amount,
    paymentMethod: sale.payment_method,
    cashAmount: sale.cash_amount || 0,
    cardAmount: sale.card_amount || 0,
    upiAmount: sale.upi_amount || 0,
    paidAmount: sale.paid_amount || 0,
    creditAmount: sale.credit_amount || 0,
    saleReturnAdjust: sale.sale_return_adjust || 0,
    pointsRedeemedAmount: sale.points_redeemed_amount || 0,
    termsConditions: settings?.terms_list?.length > 0
      ? settings.terms_list.filter((t: string) => t && t.trim())
      : sale.terms_conditions ? [sale.terms_conditions] : [],
    showTotalQuantity: settings?.show_total_quantity ?? true,
    showHSN: settings?.show_hsn_column ?? true,
    showBarcode: settings?.show_barcode ?? true,
    showGSTBreakdown: settings?.show_gst_breakdown ?? true,
    showMRP: settings?.show_mrp_column ?? false,
    showBankDetails: settings?.show_bank_details ?? false,
    bankDetails: settings?.bank_details || null,
    colorScheme: settings?.invoice_color_scheme || "blue",
    customHeaderText: settings?.invoice_header_text || "",
    customFooterText: settings?.invoice_footer_text || "",
    declarationText: settings?.declaration_text || "",
    fontFamily: settings?.font_family || "inter",
    stampImageBase64: settings?.bill_barcode_settings?.stamp_show_sale !== false
      ? settings?.bill_barcode_settings?.stamp_image_base64 || undefined
      : undefined,
    stampPosition: settings?.bill_barcode_settings?.stamp_position || 'bottom-right',
    stampSize: settings?.bill_barcode_settings?.stamp_size || 'medium',
    qrCodeUrl: sale.einvoice_qr_code || "",
    financerDetails: financerDetails || undefined,
    instagramLink: settings?.bill_barcode_settings?.instagram_link || undefined,
  };

  const renderTemplate = () => {
    if (formatParam === 'thermal') {
      const thermalItems = saleItems.map((item: any, index: number) => ({
        sr: index + 1,
        particulars: item.product_name,
        barcode: item.barcode || '',
        qty: item.quantity,
        rate: item.unit_price,
        total: item.line_total,
      }));
      const thermalProps = {
        billNo: sale.sale_number,
        date: new Date(sale.sale_date),
        customerName: sale.customer_name,
        items: thermalItems,
        subTotal: sale.gross_amount,
        discount: sale.discount_amount + sale.flat_discount_amount,
        roundOff: sale.round_off,
        grandTotal: sale.net_amount,
        paymentMethod: sale.payment_method,
        documentType: 'pos' as const,
        termsConditions: sale.terms_conditions || '',
        settingsOverride: {
          business_name: settings?.business_name,
          address: settings?.address,
          mobile_number: settings?.mobile_number,
          email_id: settings?.email_id,
          gst_number: settings?.gst_number,
          sale_settings: settings,
          bill_barcode_settings: settings?.bill_barcode_settings,
        },
      };
      if (thermalStyle === 'modern') {
        return <ModernThermalReceipt80mm ref={printRef} {...thermalProps} />;
      }
      return <ThermalPrint80mm ref={printRef} {...thermalProps} />;
    }

    switch (template) {
      case 'classic': return <ClassicTemplate {...templateProps} />;
      case 'modern': return <ModernTemplate {...templateProps} />;
      case 'modern-wholesale': return <ModernWholesaleTemplate {...templateProps} />;
      case 'minimal': return <MinimalTemplate {...templateProps} />;
      case 'compact': return <CompactTemplate {...templateProps} />;
      case 'detailed': return <DetailedTemplate {...templateProps} />;
      case 'tax-invoice': return <TaxInvoiceTemplate {...templateProps} />;
      case 'tally-tax-invoice': return <TallyTaxInvoiceTemplate {...templateProps} />;
      case 'retail': return <RetailTemplate {...templateProps} />;
      case 'retail-erp': return <RetailERPTemplate {...templateProps} />;
      case 'wholesale-a5': return <WholesaleA5Template {...templateProps} />;
      case 'professional':
      default: return <ProfessionalTemplate {...templateProps} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className={formatParam === 'thermal' ? 'max-w-[80mm] mx-auto' : 'max-w-4xl mx-auto'}>
        <div className="flex justify-center gap-4 mb-6 print:hidden">
          <Button onClick={() => handlePrint()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print Invoice
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>

        <style>{`
          @media print {
            @page { size: ${formatParam === 'thermal' ? '80mm auto' : 'A4 portrait'}; margin: ${formatParam === 'thermal' ? '3mm' : '5mm'}; }
            body { margin: 0; padding: 0; }
            .public-invoice-print-wrap {
              box-shadow: none !important;
              border-radius: 0 !important;
              background: white !important;
              overflow: visible !important;
            }
          }
        `}</style>
        <div ref={formatParam === 'thermal' ? undefined : printRef} className="public-invoice-print-wrap bg-white rounded-lg shadow-lg" style={{ overflow: 'visible' }}>
          {renderTemplate()}
        </div>

        <div className="text-center mt-6 text-sm text-muted-foreground print:hidden">
          <p>Invoice #{sale.sale_number} • Generated on {format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
        </div>
      </div>
    </div>
  );
}
