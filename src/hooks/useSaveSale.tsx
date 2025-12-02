import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
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
}

export const useSaveSale = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

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
    }
  ) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
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
      
      // Always use custom format if available, otherwise use default
      if (settings?.sale_settings?.invoice_numbering_format) {
        saleNumber = await generateInvoiceNumber(settings.sale_settings.invoice_numbering_format);
      } else {
        const { data: defaultNumber, error: numberError } = await (supabase as any)
          .rpc('generate_sale_number', { p_organization_id: currentOrganization.id });
        if (numberError) throw numberError;
        saleNumber = defaultNumber;
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
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
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
        quantity: item.quantity,
        unit_price: item.unitCost,
        mrp: item.mrp,
        gst_percent: item.gstPer,
        discount_percent: item.discountPercent,
        line_total: item.netAmount,
      }));

      const { error: itemsError } = await (supabase as any)
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Sale saved successfully",
        description: `Sale ${saleNumber} has been recorded`,
      });

      return sale;
    } catch (error: any) {
      console.error('Error saving sale:', error);
      toast({
        title: "Error saving sale",
        description: error.message || "An error occurred while saving the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  return { saveSale, isSaving };
};
