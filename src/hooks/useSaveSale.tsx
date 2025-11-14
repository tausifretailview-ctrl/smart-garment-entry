import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  customerName: string;
  items: CartItem[];
  grossAmount: number;
  discountAmount: number;
  flatDiscountPercent: number;
  flatDiscountAmount: number;
  roundOff: number;
  netAmount: number;
}

export const useSaveSale = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const saveSale = async (
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later'
  ) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save sales",
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
      // Generate sale number
      const { data: saleNumber, error: numberError } = await (supabase as any)
        .rpc('generate_sale_number');

      if (numberError) throw numberError;

      // Insert sale record
      const { data: sale, error: saleError } = await (supabase as any)
        .from('sales')
        .insert({
          sale_number: saleNumber,
          sale_type: 'pos',
          customer_name: saleData.customerName,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'pay_later' ? 'pending' : 'completed',
          created_by: user.id,
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
