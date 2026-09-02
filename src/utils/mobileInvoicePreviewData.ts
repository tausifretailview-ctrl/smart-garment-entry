import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES } from "@/utils/paymentVoucherFilters";
import { hasMobilePosWhatsAppPhone } from "@/utils/mobilePosWhatsAppMessage";

type SalesRow = Database["public"]["Tables"]["sales"]["Row"];

/** Columns that exist on `sales`. `credit_amount` is on credit_notes, not here. */
export const SALE_INVOICE_PREVIEW_FIELDS = [
  "id",
  "sale_number",
  "sale_type",
  "sale_date",
  "customer_name",
  "customer_address",
  "customer_phone",
  "gross_amount",
  "discount_amount",
  "flat_discount_amount",
  "sale_return_adjust",
  "net_amount",
  "paid_amount",
  "payment_status",
  "payment_method",
  "salesman",
  "notes",
  "round_off",
  "cash_amount",
  "card_amount",
  "upi_amount",
  "credit_applied",
] as const satisfies readonly (keyof SalesRow)[];

/** Literal so supabase-js can type the query. Do not build this with .join(). */
export const SALE_INVOICE_PREVIEW_SELECT =
  "id, sale_number, sale_type, sale_date, customer_name, customer_address, customer_phone, gross_amount, discount_amount, flat_discount_amount, sale_return_adjust, net_amount, paid_amount, payment_status, payment_method, salesman, notes, round_off, cash_amount, card_amount, upi_amount, credit_applied, customers:customer_id (gst_number, phone)" as const;

export type SaleInvoicePreviewRow = {
  id: string;
  sale_number: string;
  sale_type?: string | null;
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
  round_off?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  credit_amount?: number | null;
  salesman?: string | null;
  notes?: string | null;
  customers?: { gst_number?: string | null; phone?: string | null } | null;
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
    .select(SALE_INVOICE_PREVIEW_SELECT)
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;
  if (!sale) throw new Error("Sale not found");

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
        .eq("organization_id", organizationId)
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

  return {
    ...(sale as Omit<SaleInvoicePreviewRow, "sale_items" | "credit_amount">),
    credit_amount: Number((sale as { credit_applied?: number | null }).credit_applied || 0),
    sale_items: saleItems,
  };
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

export function nestedCustomerPhone(
  customers:
    | { phone?: string | null }
    | { phone?: string | null }[]
    | null
    | undefined,
): string | null {
  if (!customers) return null;
  const row = Array.isArray(customers) ? customers[0] : customers;
  const phone = row?.phone?.trim();
  return phone || null;
}

export function resolveSaleWhatsAppPhone(sale: {
  customer_phone?: string | null;
  customers?: { phone?: string | null } | { phone?: string | null }[] | null;
}): string | null {
  const raw = sale.customer_phone?.trim() || nestedCustomerPhone(sale.customers) || "";
  return hasMobilePosWhatsAppPhone(raw) ? raw : null;
}

export function buildSaleWhatsAppMessage(sale: {
  id: string;
  sale_number: string;
  net_amount: number;
  customer_name?: string | null;
}): string {
  const invoiceUrl = `https://app.inventoryshop.in/invoice/view/${sale.id}`;
  return [
    `Invoice ${sale.sale_number}`,
    `Amount: ₹${(sale.net_amount || 0).toLocaleString("en-IN")}`,
    `Customer: ${sale.customer_name || "Walk-in"}`,
    "",
    `View: ${invoiceUrl}`,
  ].join("\n");
}
