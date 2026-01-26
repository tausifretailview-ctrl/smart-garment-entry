import { supabase } from "@/integrations/supabase/client";

interface TransactionCheckResult {
  hasTransactions: boolean;
  usedIn: string[];
}

interface ProductRelation {
  type: string;
  count: number;
  samples: string[];
}

interface ProductRelationDetails {
  hasTransactions: boolean;
  relations: ProductRelation[];
}

export function useProductProtection() {
  // Check if a variant is used in any transaction
  const checkVariantHasTransactions = async (variantId: string): Promise<TransactionCheckResult> => {
    const [saleItems, purchaseItems, saleReturns, purchaseReturns, quotations, saleOrders, challans] = await Promise.all([
      supabase.from("sale_items").select("id").eq("variant_id", variantId).limit(1),
      supabase.from("purchase_items").select("id").eq("sku_id", variantId).limit(1),
      supabase.from("sale_return_items").select("id").eq("variant_id", variantId).limit(1),
      supabase.from("purchase_return_items").select("id").eq("sku_id", variantId).limit(1),
      supabase.from("quotation_items").select("id").eq("variant_id", variantId).limit(1),
      supabase.from("sale_order_items").select("id").eq("variant_id", variantId).limit(1),
      supabase.from("delivery_challan_items").select("id").eq("variant_id", variantId).limit(1),
    ]);

    const usedIn: string[] = [];
    if (saleItems.data?.length) usedIn.push("Sales");
    if (purchaseItems.data?.length) usedIn.push("Purchases");
    if (saleReturns.data?.length) usedIn.push("Sale Returns");
    if (purchaseReturns.data?.length) usedIn.push("Purchase Returns");
    if (quotations.data?.length) usedIn.push("Quotations");
    if (saleOrders.data?.length) usedIn.push("Sale Orders");
    if (challans.data?.length) usedIn.push("Delivery Challans");

    return { hasTransactions: usedIn.length > 0, usedIn };
  };

  // Check if a product is used in any transaction
  const checkProductHasTransactions = async (productId: string): Promise<TransactionCheckResult> => {
    const [saleItems, purchaseItems, saleReturns, purchaseReturns, quotations, saleOrders, challans] = await Promise.all([
      supabase.from("sale_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("purchase_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("sale_return_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("purchase_return_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("quotation_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("sale_order_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("delivery_challan_items").select("id").eq("product_id", productId).limit(1),
    ]);

    const usedIn: string[] = [];
    if (saleItems.data?.length) usedIn.push("Sales");
    if (purchaseItems.data?.length) usedIn.push("Purchases");
    if (saleReturns.data?.length) usedIn.push("Sale Returns");
    if (purchaseReturns.data?.length) usedIn.push("Purchase Returns");
    if (quotations.data?.length) usedIn.push("Quotations");
    if (saleOrders.data?.length) usedIn.push("Sale Orders");
    if (challans.data?.length) usedIn.push("Delivery Challans");

    return { hasTransactions: usedIn.length > 0, usedIn };
  };

  // Get detailed product relations using database function
  const getProductRelationDetails = async (productId: string): Promise<ProductRelationDetails> => {
    const { data, error } = await supabase.rpc("get_product_relations", {
      p_product_id: productId,
    });

    if (error) {
      console.error("Error fetching product relations:", error);
      // Fallback to basic check
      const basicCheck = await checkProductHasTransactions(productId);
      return {
        hasTransactions: basicCheck.hasTransactions,
        relations: basicCheck.usedIn.map(type => ({ type, count: 1, samples: [] })),
      };
    }

    const relations: ProductRelation[] = (data || []).map((row: any) => ({
      type: row.relation_type,
      count: row.record_count,
      samples: row.sample_references || [],
    }));

    return {
      hasTransactions: relations.length > 0,
      relations,
    };
  };

  return { checkVariantHasTransactions, checkProductHasTransactions, getProductRelationDetails };
}
