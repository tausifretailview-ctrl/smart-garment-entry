import { supabase } from "@/integrations/supabase/client";
import { fetchPurchaseItemsByBillId } from "@/utils/fetchAllRows";

/** Query param on /barcode-printing — survives hard reload (router state does not). */
export const BARCODE_PRINT_PURCHASE_BILL_QUERY = "purchaseBillId";

export function barcodePrintingPathWithBill(billId: string): string {
  return `/barcode-printing?${BARCODE_PRINT_PURCHASE_BILL_QUERY}=${encodeURIComponent(billId)}`;
}

export type BarcodePrintPurchaseItem = {
  sku_id?: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  mrp: number;
  pur_price: number;
  barcode: string;
  qty: number;
  bill_number: string;
  bill_date?: string;
  supplier_code: string;
  gst_per?: number;
  uom?: string;
  supplier_invoice_no?: string;
};

function hasDisplayValue(value?: string | null): value is string {
  const t = (value ?? "").trim();
  return t.length > 0 && t !== "-";
}

/**
 * Load purchase bill line items in the shape expected by BarcodePrinting
 * (same as PurchaseEntry.handlePrintBarcodes / PurchaseBillDashboard).
 */
export async function fetchBarcodePrintItemsForBill(
  organizationId: string,
  billId: string,
): Promise<{ items: BarcodePrintPurchaseItem[]; billNumber: string; billDate: string | null }> {
  if (!organizationId || !billId) {
    return { items: [], billNumber: "", billDate: null };
  }

  const { data: billData, error: billError } = await supabase
    .from("purchase_bills")
    .select("id, software_bill_no, supplier_id, bill_date, supplier_invoice_no")
    .eq("id", billId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (billError) throw billError;
  if (!billData) {
    return { items: [], billNumber: "", billDate: null };
  }

  let supplierCode = "";
  if (billData.supplier_id) {
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("supplier_code")
      .eq("id", billData.supplier_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    supplierCode = supplierData?.supplier_code || "";
  }

  const rawItems = await fetchPurchaseItemsByBillId(billId);
  if (!rawItems.length) {
    return {
      items: [],
      billNumber: billData.software_bill_no || "",
      billDate: billData.bill_date ?? null,
    };
  }

  const missingStyleIds = [
    ...new Set(
      rawItems
        .filter((item: { style?: string; product_id?: string }) => !hasDisplayValue(item.style) && item.product_id)
        .map((item: { product_id: string }) => item.product_id),
    ),
  ] as string[];

  let styleMap = new Map<string, string>();
  if (missingStyleIds.length > 0) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, style")
      .eq("organization_id", organizationId)
      .in("id", missingStyleIds);
    if (prods) {
      styleMap = new Map(
        prods.filter((p) => hasDisplayValue(p.style)).map((p) => [p.id, p.style!.trim()]),
      );
    }
  }

  const billNumber = billData.software_bill_no || "";
  const billDate =
    billData.bill_date != null ? String(billData.bill_date).slice(0, 10) : undefined;
  const supplierInvoiceNo = billData.supplier_invoice_no || "";

  const items: BarcodePrintPurchaseItem[] = rawItems.map((item: any) => ({
    sku_id: item.sku_id || item.variant_id || item.id,
    product_name: item.product_name || "",
    brand: item.brand || "",
    category: item.category || "",
    color: item.color || "",
    style: hasDisplayValue(item.style)
      ? item.style.trim()
      : styleMap.get(item.product_id) || "",
    size: item.size || "",
    sale_price: Number(item.sale_price) || 0,
    mrp: Number(item.mrp) || 0,
    pur_price: Number(item.pur_price) || 0,
    barcode: item.barcode || "",
    qty: Number(item.qty) || 0,
    bill_number: billNumber,
    bill_date: billDate,
    supplier_code: supplierCode,
    gst_per: Number(item.gst_per) || 0,
    uom: item.uom || undefined,
    supplier_invoice_no: supplierInvoiceNo,
  }));

  return {
    items,
    billNumber,
    billDate: billData.bill_date ?? null,
  };
}
