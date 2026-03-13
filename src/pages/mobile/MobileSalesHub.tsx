import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSettings } from "@/hooks/useSettings";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileDateFilterChips } from "@/components/mobile/MobileDateFilterChips";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, ChevronRight, TrendingUp, FileText, RotateCcw, Eye, MessageCircle, Download, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function MobileSalesHub() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const [period, setPeriod] = useState("today");
  const [search, setSearch] = useState("");

  // Customer history dialog state
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string | null; name: string }>({ id: null, name: "" });

  // PDF generation state
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const getDateRange = () => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    if (period === "today") return { start: today, end: today };
    if (period === "yesterday") {
      const y = format(subDays(now, 1), "yyyy-MM-dd");
      return { start: y, end: y };
    }
    if (period === "week") return { start: format(subDays(now, 7), "yyyy-MM-dd"), end: today };
    if (period === "month") return { start: format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"), end: today };
    return { start: today, end: today };
  };

  const { start, end } = getDateRange();

  const { data: salesData, isLoading } = useQuery({
    queryKey: ["mobile-sales-list", currentOrganization?.id, start, end, search],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id, sale_number, sale_date, created_at, customer_name, customer_id, net_amount, paid_amount, payment_status, sale_type, gross_amount, discount_amount, flat_discount_amount, sale_return_adjust, payment_method, salesman, notes, customer_address, customer_phone, customers(gst_number)")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .in("sale_type", ["invoice", "pos"])
        .gte("sale_date", start)
        .lte("sale_date", end)
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) {
        q = q.or(`sale_number.ilike.%${search}%,customer_name.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
  });

  const totalSales = salesData?.reduce((s, i) => s + (i.net_amount || 0), 0) || 0;
  const totalCount = salesData?.length || 0;

  const statusColor = (status: string) => {
    if (status === "paid") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "partial") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-rose-100 text-rose-700 border-rose-200";
  };

  const handleCustomerClick = (sale: any) => {
    if (sale.customer_name && sale.customer_name !== 'Walk-in') {
      setSelectedCustomer({ id: sale.customer_id || null, name: sale.customer_name });
      setShowCustomerHistory(true);
    }
  };

  // Get bill format from settings
  const getBillFormat = (): 'a4' | 'a5' | 'a5-horizontal' | 'thermal' => {
    const saleSettings = settings?.sale_settings as any;
    return saleSettings?.bill_format || 'a4';
  };

  const getInvoiceTemplate = () => {
    const saleSettings = settings?.sale_settings as any;
    return saleSettings?.invoice_template || 'professional';
  };

  const handleDownloadPDF = async (sale: any) => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(sale.id);

    toast({ title: "Generating PDF", description: "Please wait..." });

    try {
      // Fetch sale items
      const { data: items, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const saleItems = items || [];

      // Fetch product details
      if (saleItems.length > 0) {
        const productIds = [...new Set(saleItems.map((i: any) => i.product_id).filter(Boolean))];
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, brand, color, style')
            .in('id', productIds);
          if (products) {
            const productMap = Object.fromEntries(products.map(p => [p.id, p]));
            saleItems.forEach((item: any) => {
              item.products = productMap[item.product_id] || null;
            });
          }
        }
      }

      const invoiceWithItems = { ...sale, sale_items: saleItems };
      setInvoiceToPrint(invoiceWithItems);

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Poll for printRef readiness
      const MAX_WAIT = 10000;
      const startTime = Date.now();
      const waitForReady = (): Promise<boolean> => new Promise((resolve) => {
        const poll = () => {
          const el = printRef.current;
          const text = (el?.textContent || '').trim();
          const isReady = el && el.childElementCount > 0 && text.length > 32 && !/^loading\.?\.?\.?$/i.test(text);
          if (isReady) return resolve(true);
          if (Date.now() - startTime > MAX_WAIT) return resolve(false);
          setTimeout(poll, 300);
        };
        poll();
      });

      const ready = await waitForReady();
      if (!ready || !printRef.current) {
        throw new Error("Invoice template failed to render");
      }

      const billFormat = getBillFormat();
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pageFormat = billFormat === 'a5' || billFormat === 'a5-horizontal' ? 'a5' : 'a4';
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: pageFormat });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const scaledWidth = pdfWidth;
      const scaledHeight = (imgHeight * pdfWidth) / imgWidth;
      const singlePageThreshold = pdfHeight * 1.05;

      if (scaledHeight <= singlePageThreshold) {
        pdf.addImage(imgData, 'PNG', 0, 0, scaledWidth, Math.min(scaledHeight, pdfHeight));
      } else {
        const pixelsPerPage = (pdfHeight / scaledHeight) * imgHeight;
        const totalPages = Math.ceil(scaledHeight / pdfHeight);
        for (let page = 0; page < totalPages; page++) {
          if (page > 0) pdf.addPage();
          const sourceY = page * pixelsPerPage;
          const sourceH = Math.min(pixelsPerPage, imgHeight - sourceY);
          const sliceScaledHeight = (sourceH * pdfWidth) / imgWidth;
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = imgWidth;
          pageCanvas.height = Math.ceil(sourceH);
          const ctx = pageCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceH, 0, 0, imgWidth, Math.ceil(sourceH));
            const pageImgData = pageCanvas.toDataURL('image/png');
            pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, sliceScaledHeight);
          }
        }
      }

      pdf.save(`Invoice_${sale.sale_number}_${format(new Date(sale.sale_date), 'ddMMyyyy')}.pdf`);
      toast({ title: "Success", description: "PDF downloaded successfully" });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ title: "Error", description: "Failed to generate PDF. Try again.", variant: "destructive" });
    } finally {
      setInvoiceToPrint(null);
      setIsGeneratingPdf(null);
    }
  };

  const billFormat = getBillFormat();
  const invoiceTemplate = getInvoiceTemplate();
  const saleSettings = settings?.sale_settings as any;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Sales</h1>
          <button
            onClick={() => orgNavigate("/sales-invoice-dashboard")}
            className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center active:scale-90 transition-all touch-manipulation shadow-sm"
          >
            <Plus className="h-5 w-5 text-primary-foreground" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-muted/50 border-0 rounded-xl text-sm"
          />
        </div>
        <div className="-mx-4 px-4">
          <MobileDateFilterChips selectedPeriod={period} onPeriodChange={setPeriod} />
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-card border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Total Sales</span>
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground">
            ₹{totalSales >= 100000 ? `${(totalSales / 100000).toFixed(1)}L` : totalSales.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Invoices</span>
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground">{totalCount}</span>
        </div>
      </div>

      {/* Invoice List */}
      <div className="px-4 py-3 space-y-2.5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-card rounded-2xl p-4 border border-border/40 shadow-sm space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))
        ) : salesData?.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No invoices found</p>
          </div>
        ) : (
          salesData?.map((sale) => (
            <div
              key={sale.id}
              className="w-full bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm text-left overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground font-mono">{sale.sale_number}</span>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 border", statusColor(sale.payment_status || 'unpaid'))}>
                        {sale.payment_status}
                      </Badge>
                      {sale.sale_type === 'pos' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">POS</Badge>
                      )}
                    </div>
                    {/* Clickable customer name */}
                    <button
                      onClick={() => handleCustomerClick(sale)}
                      className={cn(
                        "text-xs mt-1 truncate max-w-full text-left",
                        sale.customer_name && sale.customer_name !== 'Walk-in'
                          ? "text-primary underline underline-offset-2 active:text-primary/70"
                          : "text-muted-foreground cursor-default"
                      )}
                    >
                      {sale.customer_name || 'Walk-in'}
                    </button>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {format(new Date(sale.created_at || sale.sale_date), "d MMM, hh:mm a")}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1 ml-2">
                    <p className="text-sm font-bold tabular-nums text-foreground">₹{(sale.net_amount || 0).toLocaleString("en-IN")}</p>
                    {sale.payment_status === 'partial' && (
                      <span className="text-[10px] text-rose-500">
                        Pending: ₹{Math.max(0, (sale.net_amount || 0) - (sale.paid_amount || 0)).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Action buttons row */}
              <div className="flex items-center border-t border-border/40 divide-x divide-border/40">
                <button
                  onClick={() => orgNavigate(`/sales-invoice-dashboard`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary active:bg-primary/5 transition-colors touch-manipulation"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const invoiceUrl = `https://app.inventoryshop.in/invoice/view/${sale.id}`;
                    const message = `Invoice ${sale.sale_number}%0AAmount: ₹${(sale.net_amount || 0).toLocaleString("en-IN")}%0ACustomer: ${sale.customer_name || 'Walk-in'}%0A%0AView: ${invoiceUrl}`;
                    window.open(`https://wa.me/?text=${message}`, '_blank');
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-emerald-600 active:bg-emerald-50 transition-colors touch-manipulation"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadPDF(sale);
                  }}
                  disabled={isGeneratingPdf === sale.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-violet-600 active:bg-violet-50 transition-colors touch-manipulation disabled:opacity-50"
                >
                  {isGeneratingPdf === sale.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>{isGeneratingPdf === sale.id ? 'Wait...' : 'PDF'}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sale Return quick link */}
      <div className="px-4 pb-4">
        <button
          onClick={() => orgNavigate("/sale-return-entry")}
          className="w-full bg-white dark:bg-card rounded-2xl px-4 py-3.5 border border-border/40 flex items-center justify-between active:bg-muted/30 transition-colors touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-rose-500" />
            </div>
            <span className="text-sm font-medium text-foreground">Sale Return Entry</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Customer History Dialog */}
      <CustomerHistoryDialog
        open={showCustomerHistory}
        onOpenChange={setShowCustomerHistory}
        customerId={selectedCustomer.id}
        customerName={selectedCustomer.name}
        organizationId={currentOrganization?.id || ''}
      />

      {/* Hidden Invoice for PDF Generation */}
      {invoiceToPrint && (
        <div className="no-print" style={{
          position: 'fixed',
          top: 0,
          left: '-9999px',
          width: billFormat === 'a4' ? '210mm' :
                 billFormat === 'thermal' ? '80mm' :
                 billFormat === 'a5-horizontal' ? '210mm' : '148mm',
          minHeight: billFormat === 'a4' ? '297mm' :
                     billFormat === 'thermal' ? 'auto' :
                     billFormat === 'a5-horizontal' ? '148mm' : '210mm',
          pointerEvents: 'none',
          zIndex: -9999,
          overflow: 'visible'
        }}>
          <InvoiceWrapper
            ref={printRef}
            format={billFormat === 'a5' ? 'a5-vertical' : billFormat}
            billNo={invoiceToPrint.sale_number}
            date={new Date(invoiceToPrint.sale_date)}
            customerName={invoiceToPrint.customer_name}
            customerAddress={invoiceToPrint.customer_address || ""}
            customerMobile={invoiceToPrint.customer_phone || ""}
            customerGSTIN={(invoiceToPrint.customers as any)?.gst_number || ""}
            template={invoiceTemplate}
            showMRP={saleSettings?.show_mrp_column ?? false}
            showHSN={saleSettings?.show_hsn_column ?? true}
            items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
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
            })) || []}
            subTotal={invoiceToPrint.gross_amount}
            discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
            saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
            grandTotal={invoiceToPrint.net_amount}
            paymentMethod={invoiceToPrint.payment_method}
            salesman={invoiceToPrint.salesman || ''}
            notes={invoiceToPrint.notes || ''}
          />
        </div>
      )}

      <MobileBottomNav />
    </div>
  );
}
