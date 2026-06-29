import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES } from "@/utils/paymentVoucherFilters";

export type SaleInvoicePreviewRow = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_name: string;
  customer_address?: string | null;
  customer_phone?: string | null;
  gross_amount: number;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
  sale_return_adjust?: number | null;
  net_amount: number;
  paid_amount?: number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  salesman?: string | null;
  notes?: string | null;
  customers?: { gst_number?: string | null } | null;
  sale_items: Array<{
    product_name: string;
    size?: string | null;
    barcode?: string | null;
    hsn_code?: string | null;
    mrp?: number | null;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    color?: string | null;
    item_notes?: string | null;
    gst_percent?: number | null;
    discount_percent?: number | null;
    product_id?: string | null;
    products?: { brand?: string | null; color?: string | null; style?: string | null } | null;
  }>;
};

export async function fetchSaleForInvoicePreview(
  saleId: string,
  organizationId: string,
): Promise<SaleInvoicePreviewRow> {
  const { data: sale, error } = await supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, customer_name, customer_address, customer_phone, gross_amount, discount_amount, flat_discount_amount, sale_return_adjust, net_amount, paid_amount, payment_status, payment_method, salesman, notes, customers(gst_number)",
    )
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;

  const { data: items, error: itemsErr } = await supabase
    .from("sale_items")
    .select("*")
    .eq("sale_id", saleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (itemsErr) throw itemsErr;

  const saleItems = items || [];
  if (saleItems.length > 0) {
    const productIds = [...new Set(saleItems.map((i) => i.product_id).filter(Boolean))] as string[];
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, brand, color, style")
        .in("id", productIds);
      if (products) {
        const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
        saleItems.forEach((item) => {
          (item as { products?: unknown }).products = item.product_id
            ? productMap[item.product_id] || null
            : null;
        });
      }
    }
  }

  return { ...sale, sale_items: saleItems };
}

export type SalePaymentHistoryRow = {
  id: string;
  voucher_number: string;
  voucher_date: string;
  total_amount: number;
  discount_amount: number | null;
  payment_method: string | null;
};

export async function fetchSalePaymentHistory(
  saleId: string,
  organizationId: string,
): Promise<SalePaymentHistoryRow[]> {
  const { data, error } = await supabase
    .from("voucher_entries")
    .select("id, voucher_number, voucher_date, total_amount, discount_amount, payment_method")
    .eq("organization_id", organizationId)
    .eq("reference_id", saleId)
    .in("reference_type", [...CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES])
    .ilike("voucher_type", "receipt")
    .is("deleted_at", null)
    .order("voucher_date", { ascending: false });
  if (error) throw error;
  return (data || []) as SalePaymentHistoryRow[];
}

export function buildSaleWhatsAppMessage(sale: {
  id: string;
  sale_number: string;
  net_amount: number;
  customer_name?: string | null;
}): string {
  const invoiceUrl = `https://app.inventoryshop.in/invoice/view/${sale.id}`;
  return `Invoice ${sale.sale_number}%0AAmount: ₹${(sale.net_amount || 0).toLocaleString("en-IN")}%0ACustomer: ${sale.customer_name || "Walk-in"}%0A%0AView: ${invoiceUrl}`;
}
