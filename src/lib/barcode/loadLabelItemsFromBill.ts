import { supabase } from "@/integrations/supabase/client";
import type { LabelItem } from "@/types/labelTypes";
import {
  encodePurchasePriceForLabel,
  normalizePurchaseBillDate,
  resolvePurchaseCodeDiscount,
  resolvePurchaseCodeGstPer,
} from "@/utils/purchaseCodeEncoder";
import { fetchSaleDiscPercentBySkuId } from "@/utils/pricingSaleDiscPercentLookup";

/**
 * Barcode Printing "load by bill": find a purchase bill by its number and turn its lines into
 * label items (current variant cost and product GST, the same inputs POS and the after-save
 * print use, so a reprint from an old bill matches the POS code). Moved out of
 * BarcodePrinting.tsx (Plan Phase 4, S4).
 *
 * Changed while moving: the bill is looked up inside the current shop only, bills in the
 * recycle bin are skipped, the newest matching bill wins (the match used to be whichever the
 * database returned first), and the supplier comes from the same read instead of a second one.
 */
export interface PurchaseCodeLabelOptions {
  alphabet: string;
  includeGst: boolean;
  includeDate: boolean;
  extraPercentEnabled: boolean;
  extraPercent: number;
}

export interface LoadedBill {
  id: string;
  supplier_invoice_no: string | null;
  software_bill_no: string | null;
  bill_date: string | null;
}

export type LoadLabelItemsFromBillResult =
  | { status: "bill_not_found" }
  | { status: "no_items" | "no_products" | "no_details"; bill: LoadedBill }
  | { status: "ok"; bill: LoadedBill; items: LabelItem[] };

/** Quantity of each line of a purchase bill, by variant id and by barcode. */
export interface BillLineQuantities {
  bySku: Map<string, number>;
  byBarcode: Map<string, number>;
}

/** One read of a bill's lines. Throws on a failed read. */
export async function fetchBillLineQuantities(billId: string): Promise<BillLineQuantities> {
  const { data, error } = await supabase.from("purchase_items").select("barcode, qty, sku_id").eq("bill_id", billId);
  if (error) throw error;
  const bySku = new Map<string, number>();
  const byBarcode = new Map<string, number>();
  for (const row of data || []) {
    if (row.barcode) byBarcode.set(row.barcode, row.qty);
    if (row.sku_id) bySku.set(row.sku_id, row.qty);
  }
  return { bySku, byBarcode };
}

/** A label's quantity on that bill: by variant first, then by barcode; 0 when not on it. */
export function quantityOnBill(q: BillLineQuantities, item: Pick<LabelItem, "sku_id" | "barcode">): number {
  return (item.sku_id && q.bySku.get(item.sku_id)) || (item.barcode && q.byBarcode.get(item.barcode)) || 0;
}

/** The newest bill in this shop (not in the recycle bin) whose number contains the text. */
export async function findPurchaseBillIdByNumber(orgId: string, billNumber: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(`supplier_invoice_no.ilike.%${billNumber}%,software_bill_no.ilike.%${billNumber}%`)
    .order("bill_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Throws on a failed read. */
export async function loadLabelItemsFromBill(
  orgId: string,
  billNumber: string,
  code: PurchaseCodeLabelOptions,
): Promise<LoadLabelItemsFromBillResult> {
  // Find by software_bill_no or supplier_invoice_no, in this shop, newest first.
  const { data: billData, error: billError } = await supabase
    .from("purchase_bills")
    .select("id, supplier_invoice_no, software_bill_no, bill_date, supplier_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(`supplier_invoice_no.ilike.%${billNumber}%,software_bill_no.ilike.%${billNumber}%`)
    .order("bill_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (billError) throw billError;
  if (!billData) return { status: "bill_not_found" };
  const bill: LoadedBill = billData;

  const { data: itemsData, error: itemsError } = await supabase
    .from("purchase_items")
    .select(`
      qty,
      sku_id,
      barcode,
      sale_price,
      pur_price,
      mrp,
      size,
      gst_per
    `)
    .eq("bill_id", billData.id);
  if (itemsError) throw itemsError;
  if (!itemsData || itemsData.length === 0) return { status: "no_items", bill };

  // Get unique SKU IDs to fetch product details
  const skuIds = itemsData.map((item) => item.sku_id).filter(Boolean);
  if (skuIds.length === 0) return { status: "no_products", bill };

  let supplierCode = "";
  if (billData.supplier_id) {
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("supplier_code")
      .eq("id", billData.supplier_id)
      .maybeSingle();
    supplierCode = supplierData?.supplier_code || "";
  }

  // Fetch product details including variants
  const { data: variantsData, error: variantsError } = await supabase
    .from("product_variants")
    .select(`
      id,
      size,
      barcode,
      color,
      sale_price,
      mrp,
      pur_price,
      product_id,
      products (
        product_name,
        brand,
        color,
        style,
        uom,
        purchase_gst_percent,
        gst_per,
        purchase_discount_type,
        purchase_discount_value
      )
    `)
    .in("id", skuIds);
  if (variantsError) throw variantsError;

  // Create a map of variant details
  const variantMap = new Map();
  (variantsData || []).forEach((variant: any) => {
    variantMap.set(variant.id, {
      product_name: variant.products?.product_name || "",
      brand: variant.products?.brand || "",
      category: variant.products?.category || "",
      color: (variant.color || variant.products?.color || "").trim(),
      style: variant.products?.style || "",
      size: variant.size,
      barcode: variant.barcode,
      sale_price: variant.sale_price,
      mrp: variant.mrp,
      pur_price: Number(variant.pur_price) || 0,
      product: variant.products,
      uom: variant.products?.uom || "NOS",
    });
  });

  // Build label items from purchase items
  const loadedItems: LabelItem[] = itemsData
    .filter((item) => item.sku_id && variantMap.has(item.sku_id))
    .map((item) => {
      const variantInfo = variantMap.get(item.sku_id);
      const purPrice = variantInfo.pur_price || item.pur_price || 0;
      const gstPer = resolvePurchaseCodeGstPer(variantInfo.product, (item as any).gst_per);
      const purDisc = resolvePurchaseCodeDiscount(variantInfo.product);
      return {
        sku_id: item.sku_id,
        product_name: variantInfo.product_name,
        brand: variantInfo.brand,
        category: variantInfo.category,
        color: variantInfo.color,
        style: variantInfo.style,
        size: item.size || variantInfo.size,
        sale_price: item.sale_price || variantInfo.sale_price,
        mrp: item.mrp || variantInfo.mrp || 0,
        pur_price: purPrice,
        gst_per: gstPer,
        pur_disc: purDisc,
        purchase_code: encodePurchasePriceForLabel(purPrice, code.alphabet, {
          gstPer,
          purchaseDiscount: purDisc,
          includeGst: code.includeGst,
          extraPercentEnabled: code.extraPercentEnabled,
          extraPercent: code.extraPercent,
          billDate: normalizePurchaseBillDate(billData.bill_date),
          includeDate: code.includeDate,
        }),
        bill_date: normalizePurchaseBillDate(billData.bill_date),
        barcode: item.barcode || variantInfo.barcode,
        bill_number: billData.software_bill_no || "",
        supplier_invoice_no: billData.supplier_invoice_no || "",
        qty: item.qty,
        uom: variantInfo.uom || "NOS",
        supplier_code: supplierCode,
        sale_disc_percent: null,
      };
    });

  const discBySku = await fetchSaleDiscPercentBySkuId(
    orgId,
    loadedItems.map((i) => i.sku_id).filter((id): id is string => Boolean(id)),
  );
  for (const row of loadedItems) {
    if (row.sku_id && discBySku.has(row.sku_id)) {
      row.sale_disc_percent = discBySku.get(row.sku_id);
    }
  }

  if (loadedItems.length === 0) return { status: "no_details", bill };
  return { status: "ok", bill, items: loadedItems };
}
