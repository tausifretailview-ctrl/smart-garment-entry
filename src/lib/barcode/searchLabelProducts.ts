import { supabase } from "@/integrations/supabase/client";
import {
  resolvePurchaseCodeDiscount,
  resolvePurchaseCodeGstPer,
  type PurchaseCodeDiscount,
} from "@/utils/purchaseCodeEncoder";
import { fetchSaleDiscPercentBySkuId } from "@/utils/pricingSaleDiscPercentLookup";

/**
 * Barcode Printing product search (name / brand / colour / style / size / barcode, in-stock
 * variants only), with each variant's latest supplier code and sale discount. Moved out of
 * BarcodePrinting.tsx unchanged (Plan Phase 4, S4).
 */
export interface LabelProductSearchResult {
  id: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  mrp?: number;
  sale_disc_percent?: number | null;
  barcode: string;
  stock_qty: number;
  supplier_code?: string;
  pur_price?: number;
  /** Product purchase GST % — for the purchase code when "Include GST in code" is on. */
  gst_per?: number;
  pur_disc?: PurchaseCodeDiscount;
  uom?: string;
}
type SearchResult = LabelProductSearchResult;

/** Up to 50 matching in-stock variants. Throws on a failed search. */
export async function searchLabelProducts(orgId: string, searchQuery: string): Promise<LabelProductSearchResult[]> {
  // First search products table for name/brand/style matches
  const { data: matchingProducts } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(`product_name.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,style.ilike.%${searchQuery}%`);

  const productIds = matchingProducts?.map((p) => p.id) || [];

  // Build variants query with organization filter
  let variantsQuery = supabase
    .from("product_variants")
    .select(
      `
      id,
      size,
      sale_price,
      mrp,
      barcode,
      stock_qty,
      color,
      pur_price,
      product_id,
      products (
        product_name,
        brand,
        color,
        style,
        category,
        uom,
        purchase_gst_percent,
        gst_per,
        purchase_discount_type,
        purchase_discount_value
      )
    `
    )
    .eq("organization_id", orgId)
    .eq("active", true)
    .is("deleted_at", null)
    .gt("stock_qty", 0);

  const isBarcode = /^[A-Z]{2,4}[0-9]{5,}$|^[0-9]{6,}$/.test(searchQuery.trim());

  if (isBarcode) {
    // Exact + prefix match — uses B-tree index
    if (productIds.length > 0) {
      variantsQuery = variantsQuery.or(`barcode.eq.${searchQuery.trim()},barcode.ilike.${searchQuery.trim()}%,product_id.in.(${productIds.join(",")})`);
    } else {
      variantsQuery = variantsQuery.or(`barcode.eq.${searchQuery.trim()},barcode.ilike.${searchQuery.trim()}%`);
    }
  } else {
    // Fuzzy search — uses trgm index
    if (productIds.length > 0) {
      variantsQuery = variantsQuery.or(
        `barcode.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%,product_id.in.(${productIds.join(",")})`
      );
    } else {
      variantsQuery = variantsQuery.or(`barcode.ilike.%${searchQuery}%,color.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%`);
    }
  }

  const { data, error } = await variantsQuery.limit(50);

  if (error) throw error;

  // Get variant IDs to fetch supplier codes
  const variantIds = (data || []).map((v: any) => v.id);
  
  // Fetch the most recent supplier code for each variant from purchase_items
  const supplierCodeMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: purchaseData } = await supabase
      .from("purchase_items")
      .select("sku_id, bill_id, created_at, purchase_bills!inner(organization_id, deleted_at)")
      .in("sku_id", variantIds)
      .eq("purchase_bills.organization_id", orgId)
      .is("purchase_bills.deleted_at", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (purchaseData) {
      // Get unique bill IDs
      const billIds = [...new Set(purchaseData.map((item: any) => item.bill_id))];
      
      // Fetch supplier info for these bills
      const { data: billData } = await supabase
        .from("purchase_bills")
        .select("id, supplier_id")
        .in("id", billIds);

      if (billData) {
        // Get supplier IDs
        const supplierIds = [...new Set(billData.map((bill: any) => bill.supplier_id).filter(Boolean))];
        
        // Fetch supplier codes
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("id, supplier_code")
          .in("id", supplierIds);

        // Build a map of bill_id -> supplier_code
        const billSupplierMap = new Map<string, string>();
        if (supplierData) {
          billData.forEach((bill: any) => {
            const supplier = supplierData.find((s: any) => s.id === bill.supplier_id);
            if (supplier?.supplier_code) {
              billSupplierMap.set(bill.id, supplier.supplier_code);
            }
          });
        }

        // Map sku_id to supplier_code (most recent purchase)
        const processedSkus = new Set<string>();
        purchaseData.forEach((item: any) => {
          if (!processedSkus.has(item.sku_id)) {
            const supplierCode = billSupplierMap.get(item.bill_id);
            if (supplierCode) {
              supplierCodeMap.set(item.sku_id, supplierCode);
            }
            processedSkus.add(item.sku_id);
          }
        });
      }
    }
  }

  const results: SearchResult[] = (data || []).map((v: any) => ({
    id: v.id,
    product_name: v.products?.product_name || "",
    brand: v.products?.brand || "",
    category: v.products?.category || "",
    color: v.color || v.products?.color || "",
    style: v.products?.style || "",
    size: v.size,
    sale_price: v.sale_price || 0,
    mrp: v.mrp || 0,
    barcode: v.barcode || "",
    stock_qty: v.stock_qty || 0,
    supplier_code: supplierCodeMap.get(v.id) || "",
    pur_price: v.pur_price || 0,
    gst_per: resolvePurchaseCodeGstPer(v.products, 0),
    pur_disc: resolvePurchaseCodeDiscount(v.products),
    uom: v.products?.uom || "NOS",
    sale_disc_percent: null,
  }));

  const discMap = await fetchSaleDiscPercentBySkuId(
    orgId,
    results.map((r) => r.id),
  );
  for (const row of results) {
    if (discMap.has(row.id)) row.sale_disc_percent = discMap.get(row.id);
  }

  return results;
}
