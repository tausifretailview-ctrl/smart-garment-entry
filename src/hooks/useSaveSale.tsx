import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useCustomerPoints } from "@/hooks/useCustomerPoints";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { generateAndUploadInvoicePDF, InvoicePdfData, generateInvoicePdfBase64 } from "@/utils/invoicePdfUploader";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color?: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
}

interface SaleData {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  items: CartItem[];
  grossAmount: number;
  discountAmount: number;
  flatDiscountPercent: number;
  flatDiscountAmount: number;
  saleReturnAdjust: number;
  roundOff: number;
  netAmount: number;
  refundAmount?: number;
  salesman?: string | null;
  notes?: string | null;
  pointsRedeemedAmount?: number;
}

export const useSaveSale = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const savingLockRef = useRef(false); // Synchronous lock to prevent duplicate saves
  const { awardPoints, isPointsEnabled, calculatePoints } = useCustomerPoints();
  const { invalidateSales } = useDashboardInvalidation();

  const generateInvoiceNumber = async (format: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Check if format has placeholders
    const hasPlaceholders = format.includes('{');
    
    // Try up to 10 times to find a unique invoice number
    for (let attempt = 0; attempt < 10; attempt++) {
      let invoiceNumber: string;
      
      if (hasPlaceholders) {
        // Get the last invoice number matching this format pattern
        const { data: lastSale } = await (supabase as any)
          .from('sales')
          .select('sale_number')
          .eq('organization_id', currentOrganization?.id)
          .is('deleted_at', null)
          .like('sale_number', `%${year}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Extract the last sequence number
        let sequence = 1;
        if (lastSale?.sale_number) {
          const matches = lastSale.sale_number.match(/(\d+)$/);
          if (matches) {
            sequence = parseInt(matches[1]) + 1 + attempt;
          }
        }

        // Replace placeholders in format
        invoiceNumber = format
          .replace('{YYYY}', String(year))
          .replace('{YY}', String(year).slice(-2))
          .replace('{MM}', month)
          .replace('{####}', String(sequence).padStart(4, '0'))
          .replace('{###}', String(sequence).padStart(3, '0'))
          .replace('{#####}', String(sequence).padStart(5, '0'));
      } else {
        // Format is literal string, find last matching invoice and increment
        const basePattern = format.replace(/\d+$/, ''); // Remove trailing numbers
        
        const { data: lastSale } = await (supabase as any)
          .from('sales')
          .select('sale_number')
          .eq('organization_id', currentOrganization?.id)
          .is('deleted_at', null)
          .like('sale_number', `${basePattern}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let sequence = 1;
        if (lastSale?.sale_number) {
          const matches = lastSale.sale_number.match(/(\d+)$/);
          if (matches) {
            sequence = parseInt(matches[1]) + 1 + attempt;
          }
        }

        // Append sequence to base pattern
        invoiceNumber = `${basePattern}${sequence}`;
      }

      // Check if this number already exists
      const { data: existing } = await (supabase as any)
        .from('sales')
        .select('id')
        .eq('sale_number', invoiceNumber)
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      if (!existing) {
        return invoiceNumber;
      }
    }

    // Fallback: use timestamp-based unique number
    return `SALE-${Date.now()}`;
  };

  const saveSale = async (
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    },
    saleType: 'pos' | 'sale_invoice' = 'pos'
  ) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to save sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "Cannot save sale with no items",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Fetch settings to get invoice format
      const { data: settings } = await (supabase as any)
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();

      let saleNumber: string;
      
      // Use POS format for POS sales, Invoice format for regular sales
      if (saleType === 'pos') {
        // Check for custom POS format first
        if (settings?.sale_settings?.pos_numbering_format) {
          saleNumber = await generateInvoiceNumber(settings.sale_settings.pos_numbering_format);
        } else {
          // Use default POS format: POS/YY-YY/N
          const { data: defaultNumber, error: numberError } = await (supabase as any)
            .rpc('generate_pos_number', { p_organization_id: currentOrganization.id });
          if (numberError) throw numberError;
          saleNumber = defaultNumber;
        }
      } else {
        // Sale Invoice format
        if (settings?.sale_settings?.invoice_numbering_format) {
          saleNumber = await generateInvoiceNumber(settings.sale_settings.invoice_numbering_format);
        } else {
          // Use default INV format: INV/YY-YY/N
          const { data: defaultNumber, error: numberError } = await (supabase as any)
            .rpc('generate_sale_number', { p_organization_id: currentOrganization.id });
          if (numberError) throw numberError;
          saleNumber = defaultNumber;
        }
      }

      // Calculate payment status and amounts
      let cashAmt = 0;
      let cardAmt = 0;
      let upiAmt = 0;
      let paidAmt = 0;
      let refundAmt = 0;
      let payStatus = 'completed';
      let finalPaymentMethod = paymentMethod;

      if (paymentBreakdown) {
        // Mix payment or refund
        cashAmt = paymentBreakdown.cashAmount;
        cardAmt = paymentBreakdown.cardAmount;
        upiAmt = paymentBreakdown.upiAmount;
        paidAmt = paymentBreakdown.totalPaid;
        refundAmt = paymentBreakdown.refundAmount;
        
        // Use 'multiple' as payment method for refunds or mixed payments
        finalPaymentMethod = 'multiple';
        
        if (paidAmt >= saleData.netAmount) {
          payStatus = 'completed';
        } else if (paidAmt > 0) {
          payStatus = 'partial';
        } else {
          payStatus = 'pending';
        }
      } else {
        // Single payment method
        paidAmt = paymentMethod === 'pay_later' ? 0 : saleData.netAmount;
        payStatus = paymentMethod === 'pay_later' ? 'pending' : 'completed';
        
        if (paymentMethod === 'cash') {
          cashAmt = saleData.netAmount;
        } else if (paymentMethod === 'card') {
          cardAmt = saleData.netAmount;
        } else if (paymentMethod === 'upi') {
          upiAmt = saleData.netAmount;
        }
      }

      // Store refund amount from saleData if provided
      if (saleData.refundAmount) {
        refundAmt = saleData.refundAmount;
      }

      // Insert sale record
      const { data: sale, error: saleError } = await (supabase as any)
        .from('sales')
        .insert({
          sale_number: saleNumber,
          sale_type: saleType,
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
          points_redeemed_amount: saleData.pointsRedeemedAmount || 0,
          salesman: saleData.salesman || null,
          notes: saleData.notes || null,
          created_by: user.id,
          organization_id: currentOrganization.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Insert sale items
      const saleItems = saleData.items.map((item) => ({
        sale_id: sale.id,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        color: item.color || null,
        quantity: item.quantity,
        unit_price: item.unitCost,
        mrp: item.mrp,
        gst_percent: item.gstPer,
        discount_percent: item.discountPercent,
        line_total: item.netAmount,
        hsn_code: item.hsnCode || null,
      }));

      const { error: itemsError } = await (supabase as any)
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Award loyalty points if enabled and customer exists
      let pointsAwarded = 0;
      if (isPointsEnabled && saleData.customerId && paymentMethod !== 'pay_later') {
        const result = await awardPoints(
          saleData.customerId,
          sale.id,
          saleData.netAmount,
          saleNumber
        );
        pointsAwarded = result.pointsAwarded;
      }

      // Auto-send WhatsApp invoice notification - TWO FLOW APPROACH
      // Flow A: Utility/Text template (immediate notification)
      // Flow B: Document template with PDF (only if enabled and configured)
      if (saleData.customerPhone && currentOrganization?.id) {
        try {
          // Check WhatsApp settings
          const { data: whatsappSettings } = await (supabase as any)
            .from('whatsapp_api_settings')
            .select('is_active, auto_send_invoice, invoice_template_name, auto_send_invoice_link, invoice_link_message, social_links, send_invoice_pdf, invoice_pdf_template, use_document_header_template, invoice_document_template_name')
            .eq('organization_id', currentOrganization.id)
            .maybeSingle();

          if (whatsappSettings?.is_active && whatsappSettings?.auto_send_invoice) {
            // Fetch company settings from settings table (not organizations.settings)
            const { data: companySettings } = await supabase
              .from('settings')
              .select('business_name, mobile_number, address, gst_number')
              .eq('organization_id', currentOrganization.id)
              .maybeSingle();

            const companyName = companySettings?.business_name || currentOrganization.name || 'Our Company';
            
            // Build invoice message for template parameters
            const formattedDate = new Date(sale.sale_date || Date.now()).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });
            const formattedAmount = `${Number(saleData.netAmount).toLocaleString('en-IN')}`;

            // Build message text (used as fallback if no template)
            const messageText = `Hello ${saleData.customerName},\n\nYour invoice ${saleNumber} has been created.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\n\nThank you for your business!\n${companyName}`;

            // Build saleData object for dynamic parameter building in edge function
            const saleDataForWhatsApp = {
              sale_id: sale.id,
              org_slug: currentOrganization.slug,
              customer_name: saleData.customerName,
              sale_number: saleNumber,
              sale_date: sale.sale_date,
              net_amount: saleData.netAmount,
              gross_amount: saleData.grossAmount,
              discount_amount: saleData.discountAmount,
              payment_status: sale.payment_status,
              items_count: saleData.items.reduce((sum, item) => sum + item.quantity, 0),
              salesman: saleData.salesman,
              organization_name: companyName,
              // Include social links from settings
              website: whatsappSettings.social_links?.website || '',
              instagram: whatsappSettings.social_links?.instagram || '',
              facebook: whatsappSettings.social_links?.facebook || '',
            };

            // ============================================
            // FLOW A: Utility/Text Template (TEXT or NONE header)
            // Send immediate invoice notification without PDF
            // This template MUST have TEXT or NONE header type
            // ============================================
            const hasUtilityTemplate = whatsappSettings.invoice_template_name && 
              !whatsappSettings.use_document_header_template;

            if (hasUtilityTemplate) {
              try {
                await supabase.functions.invoke('send-whatsapp', {
                  body: {
                    organizationId: currentOrganization.id,
                    phone: saleData.customerPhone,
                    message: messageText,
                    templateType: 'sales_invoice',
                    templateName: whatsappSettings.invoice_template_name,
                    saleData: saleDataForWhatsApp,
                    referenceId: sale.id,
                    referenceType: 'sale',
                    // Flow A: No PDF attachment
                    documentUrl: undefined,
                    documentFilename: undefined,
                    documentCaption: undefined,
                    useDocumentHeaderTemplate: false,
                    documentHeaderTemplateName: null,
                    pdfBlob: null,
                  }
                });
              } catch (flowAError) {
                // Log Flow A failure but continue to Flow B if enabled
                console.error('WhatsApp Flow A (utility template) failed:', flowAError);
              }
            }

            // ============================================
            // FLOW B: Document Header Template with PDF
            // Only if "Direct PDF Delivery" is enabled
            // This uses DOCUMENT header template (bypasses 24h window)
            // ============================================
            const shouldSendPdfFlow = whatsappSettings.use_document_header_template && 
              whatsappSettings.invoice_document_template_name;

            if (shouldSendPdfFlow) {
              try {
                // Calculate tax amount for PDF
                const taxAmount = saleData.items.reduce((sum, item) => {
                  const taxableAmount = item.netAmount / (1 + item.gstPer / 100);
                  return sum + (item.netAmount - taxableAmount);
                }, 0);

                const pdfData: InvoicePdfData = {
                  billNo: saleNumber,
                  billDate: new Date(sale.sale_date || sale.created_at || Date.now()),
                  customerName: saleData.customerName,
                  customerPhone: saleData.customerPhone || undefined,
                  items: saleData.items.map(item => ({
                    particulars: item.productName,
                    size: item.size,
                    quantity: item.quantity,
                    rate: item.unitCost,
                    mrp: item.mrp,
                    discount: item.discountPercent,
                    gstPercent: item.gstPer,
                    total: item.netAmount,
                    hsnCode: item.hsnCode,
                    color: item.color,
                  })),
                  grossAmount: saleData.grossAmount,
                  discountAmount: saleData.discountAmount,
                  taxAmount: taxAmount,
                  netAmount: saleData.netAmount,
                  paymentMethod: finalPaymentMethod,
                  paidAmount: paidAmt,
                  companyName: companyName,
                  companyAddress: companySettings?.address || undefined,
                  companyPhone: companySettings?.mobile_number || undefined,
                  companyGst: companySettings?.gst_number || undefined,
                };

                const documentFilename = `Invoice_${saleNumber.replace(/\//g, '-')}.pdf`;
                
                // Generate base64 PDF for Meta upload
                const pdfBase64 = generateInvoicePdfBase64(pdfData);

                if (pdfBase64) {
                  await supabase.functions.invoke('send-whatsapp', {
                    body: {
                      organizationId: currentOrganization.id,
                      phone: saleData.customerPhone,
                      message: `Invoice ${saleNumber} PDF attached`,
                      templateType: 'sales_invoice_pdf',
                      templateName: null, // Don't use regular template for PDF flow
                      saleData: saleDataForWhatsApp,
                      referenceId: sale.id,
                      referenceType: 'sale',
                      // Flow B: PDF embedded in document header template
                      useDocumentHeaderTemplate: true,
                      documentHeaderTemplateName: whatsappSettings.invoice_document_template_name,
                      pdfBlob: pdfBase64,
                      documentFilename: documentFilename,
                    }
                  });
                }
              } catch (flowBError) {
                // Flow B failure should NOT block the sale
                console.error('WhatsApp Flow B (PDF delivery) failed:', flowBError);
              }
            }
          }
        } catch (whatsappError) {
          // Don't fail the sale if WhatsApp notification fails
          console.error('WhatsApp auto-send failed:', whatsappError);
        }
      }

      // Invalidate dashboard queries for immediate UI refresh
      invalidateSales();

      return { ...sale, pointsAwarded };
    } catch (error: any) {
      console.error('Error saving sale:', error);
      toast({
        title: "Error saving sale",
        description: error.message || "An error occurred while saving the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  // Update an existing sale (for edit mode)
  // Stock is automatically handled by database triggers when sale_items are deleted/inserted
  const updateSale = async (
    saleId: string,
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    }
  ) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to update sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "Cannot save sale with no items",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Calculate payment status and amounts
      let cashAmt = 0;
      let cardAmt = 0;
      let upiAmt = 0;
      let paidAmt = 0;
      let refundAmt = 0;
      let payStatus = 'completed';
      let finalPaymentMethod = paymentMethod;

      if (paymentBreakdown) {
        cashAmt = paymentBreakdown.cashAmount;
        cardAmt = paymentBreakdown.cardAmount;
        upiAmt = paymentBreakdown.upiAmount;
        paidAmt = paymentBreakdown.totalPaid;
        refundAmt = paymentBreakdown.refundAmount;
        finalPaymentMethod = 'multiple';
        
        if (paidAmt >= saleData.netAmount) {
          payStatus = 'completed';
        } else if (paidAmt > 0) {
          payStatus = 'partial';
        } else {
          payStatus = 'pending';
        }
      } else {
        paidAmt = paymentMethod === 'pay_later' ? 0 : saleData.netAmount;
        payStatus = paymentMethod === 'pay_later' ? 'pending' : 'completed';
        
        if (paymentMethod === 'cash') {
          cashAmt = saleData.netAmount;
        } else if (paymentMethod === 'card') {
          cardAmt = saleData.netAmount;
        } else if (paymentMethod === 'upi') {
          upiAmt = saleData.netAmount;
        }
      }

      if (saleData.refundAmount) {
        refundAmt = saleData.refundAmount;
      }

      // Step 1: Delete existing sale_items (triggers stock restoration via handle_sale_item_delete)
      const { error: deleteError } = await (supabase as any)
        .from('sale_items')
        .delete()
        .eq('sale_id', saleId);

      if (deleteError) throw deleteError;

      // Step 2: Insert new sale_items (triggers stock deduction via update_stock_on_sale)
      const saleItems = saleData.items.map((item) => ({
        sale_id: saleId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        color: item.color || null,
        quantity: item.quantity,
        unit_price: item.unitCost,
        mrp: item.mrp,
        gst_percent: item.gstPer,
        discount_percent: item.discountPercent,
        line_total: item.netAmount,
        hsn_code: item.hsnCode || null,
      }));

      const { error: itemsError } = await (supabase as any)
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Step 3: Update the sales record
      const { data: sale, error: saleError } = await (supabase as any)
        .from('sales')
        .update({
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
          points_redeemed_amount: saleData.pointsRedeemedAmount || 0,
          salesman: saleData.salesman || null,
          notes: saleData.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', saleId)
        .select()
        .single();

      if (saleError) throw saleError;

      toast({
        title: "Sale updated successfully",
        description: `Sale ${sale.sale_number} has been updated`,
      });

      // Invalidate dashboard queries for immediate UI refresh
      invalidateSales();

      return sale;
    } catch (error: any) {
      console.error('Error updating sale:', error);
      toast({
        title: "Error updating sale",
        description: error.message || "An error occurred while updating the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  // Hold a sale (save without affecting stock - items stored in notes as JSON)
  const holdSale = async (saleData: SaleData) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to hold sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "Cannot hold sale with no items",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Fetch settings to get invoice format
      const { data: settings } = await (supabase as any)
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();

      let saleNumber: string;
      
      if (settings?.sale_settings?.invoice_numbering_format) {
        saleNumber = await generateInvoiceNumber(settings.sale_settings.invoice_numbering_format);
      } else {
        const { data: defaultNumber, error: numberError } = await (supabase as any)
          .rpc('generate_sale_number', { p_organization_id: currentOrganization.id });
        if (numberError) throw numberError;
        saleNumber = defaultNumber;
      }

      // Store items as JSON in notes field for later retrieval
      const holdData = {
        items: saleData.items,
        flatDiscountPercent: saleData.flatDiscountPercent,
        saleReturnAdjust: saleData.saleReturnAdjust,
        roundOff: saleData.roundOff,
      };

      // Insert sale record with hold status (NO sale_items - no stock impact)
      const { data: sale, error: saleError } = await (supabase as any)
        .from('sales')
        .insert({
          sale_number: saleNumber,
          sale_type: 'pos',
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: 'pay_later',
          payment_status: 'hold',
          paid_amount: 0,
          cash_amount: 0,
          card_amount: 0,
          upi_amount: 0,
          refund_amount: 0,
          salesman: saleData.salesman || null,
          notes: JSON.stringify(holdData),
          created_by: user.id,
          organization_id: currentOrganization.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      toast({
        title: "Bill on Hold",
        description: `Bill ${saleNumber} has been put on hold`,
      });

      return sale;
    } catch (error: any) {
      console.error('Error holding sale:', error);
      toast({
        title: "Error holding sale",
        description: error.message || "An error occurred while holding the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  // Resume a held sale - convert to actual sale with stock deduction
  const resumeHeldSale = async (
    heldSaleId: string,
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    }
  ) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user || !currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to complete sales",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Calculate payment status and amounts
      let cashAmt = 0;
      let cardAmt = 0;
      let upiAmt = 0;
      let paidAmt = 0;
      let refundAmt = 0;
      let payStatus = 'completed';
      let finalPaymentMethod = paymentMethod;

      if (paymentBreakdown) {
        cashAmt = paymentBreakdown.cashAmount;
        cardAmt = paymentBreakdown.cardAmount;
        upiAmt = paymentBreakdown.upiAmount;
        paidAmt = paymentBreakdown.totalPaid;
        refundAmt = paymentBreakdown.refundAmount;
        finalPaymentMethod = 'multiple';
        
        if (paidAmt >= saleData.netAmount) {
          payStatus = 'completed';
        } else if (paidAmt > 0) {
          payStatus = 'partial';
        } else {
          payStatus = 'pending';
        }
      } else {
        paidAmt = paymentMethod === 'pay_later' ? 0 : saleData.netAmount;
        payStatus = paymentMethod === 'pay_later' ? 'pending' : 'completed';
        
        if (paymentMethod === 'cash') {
          cashAmt = saleData.netAmount;
        } else if (paymentMethod === 'card') {
          cardAmt = saleData.netAmount;
        } else if (paymentMethod === 'upi') {
          upiAmt = saleData.netAmount;
        }
      }

      if (saleData.refundAmount) {
        refundAmt = saleData.refundAmount;
      }

      // Insert sale items (NOW affects stock via triggers)
      const saleItems = saleData.items.map((item) => ({
        sale_id: heldSaleId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        color: item.color || null,
        quantity: item.quantity,
        unit_price: item.unitCost,
        mrp: item.mrp,
        gst_percent: item.gstPer,
        discount_percent: item.discountPercent,
        line_total: item.netAmount,
        hsn_code: item.hsnCode || null,
      }));

      const { error: itemsError } = await (supabase as any)
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Update the held sale to completed
      const { data: sale, error: saleError } = await (supabase as any)
        .from('sales')
        .update({
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
          salesman: saleData.salesman || null,
          notes: null, // Clear the held items data
          updated_at: new Date().toISOString(),
        })
        .eq('id', heldSaleId)
        .select()
        .single();

      if (saleError) throw saleError;

      toast({
        title: "Sale completed",
        description: `Sale ${sale.sale_number} has been completed`,
      });

      // Invalidate dashboard queries for immediate UI refresh
      invalidateSales();

      return sale;
    } catch (error: any) {
      console.error('Error resuming held sale:', error);
      toast({
        title: "Error completing sale",
        description: error.message || "An error occurred while completing the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  return { saveSale, updateSale, holdSale, resumeHeldSale, isSaving };
};
