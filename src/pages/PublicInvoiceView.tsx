import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download, FileX } from "lucide-react";
import { format } from "date-fns";
import { useRef, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import { ProfessionalTemplate } from "@/components/invoice-templates/ProfessionalTemplate";

// Update document meta tags for link previews
const updateMetaTags = (businessName: string, invoiceNumber: string, orgSlug?: string, logoUrl?: string) => {
  document.title = `Invoice ${invoiceNumber} - ${businessName}`;
  
  // Update OG meta tags
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
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch sale data
  const { data: sale, isLoading: saleLoading, error: saleError } = useQuery({
    queryKey: ['public-sale', saleId],
    queryFn: async () => {
      if (!saleId) return null;
      const { data, error } = await supabase
        .from('sales')
        .select(`*, sale_items (*)`)
        .eq('id', saleId)
        .is('deleted_at', null) // Exclude soft-deleted invoices
        .maybeSingle(); // Use maybeSingle to avoid error when not found
      
      if (error) throw error;
      return data;
    },
    enabled: !!saleId,
  });

  // Fetch organization settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['public-settings', sale?.organization_id],
    queryFn: async () => {
      if (!sale?.organization_id) return null;
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', sale.organization_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!sale?.organization_id,
  });

  // Fetch organization for slug
  const { data: organization } = useQuery({
    queryKey: ['public-organization', sale?.organization_id],
    queryFn: async () => {
      if (!sale?.organization_id) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('slug, name')
        .eq('id', sale.organization_id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!sale?.organization_id,
  });

  // Update meta tags when settings load
  useEffect(() => {
    if (settings?.business_name && sale?.sale_number) {
      const logoUrl = (settings?.sale_settings as any)?.invoiceLogo || '';
      updateMetaTags(settings.business_name, sale.sale_number, organization?.slug, logoUrl);
    }
  }, [settings, sale, organization]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: sale?.sale_number || "Invoice",
  });

  if (saleLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (saleError || !sale) {
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
  const totalQty = saleItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Action Buttons */}
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

        {/* Invoice Content */}
        <div ref={printRef} className="bg-white rounded-lg shadow-lg">
          <ProfessionalTemplate
            businessName={settings?.business_name || "Business"}
            address={settings?.address || ""}
            mobile={settings?.mobile_number || ""}
            email={settings?.email_id || ""}
            gstNumber={settings?.gst_number || ""}
            logoUrl=""
            invoiceNumber={sale.sale_number}
            invoiceDate={new Date(sale.sale_date)}
            customerName={sale.customer_name}
            customerAddress={sale.customer_address || ""}
            customerMobile={sale.customer_phone || ""}
            customerGSTIN=""
            items={saleItems.map((item: any, index: number) => ({
              sr: index + 1,
              barcode: item.barcode || "",
              particulars: item.product_name,
              size: item.size,
              hsn: "",
              sp: item.mrp,
              qty: item.quantity,
              rate: item.unit_price,
              total: item.line_total,
              brand: "",
              category: "",
              color: "",
              style: "",
            }))}
            subtotal={sale.gross_amount}
            discount={sale.discount_amount + sale.flat_discount_amount}
            taxableAmount={sale.gross_amount - sale.discount_amount - sale.flat_discount_amount}
            totalTax={0}
            roundOff={sale.round_off}
            grandTotal={sale.net_amount}
            paymentMethod={sale.payment_method}
            termsConditions={sale.terms_conditions ? [sale.terms_conditions] : []}
            showTotalQuantity={true}
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-muted-foreground print:hidden">
          <p>Invoice #{sale.sale_number} • Generated on {format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
        </div>
      </div>
    </div>
  );
}
