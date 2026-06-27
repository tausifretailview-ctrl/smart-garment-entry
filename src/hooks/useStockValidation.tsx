import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";

interface StockCheckResult {
  isAvailable: boolean;
  availableStock: number;
  productName: string;
  size: string;
}

interface OldItem {
  variantId: string;
  quantity: number;
}

/**
 * Hook for real-time stock validation to prevent overselling
 * Checks available stock before allowing transactions
 */
export const useStockValidation = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [checking, setChecking] = useState(false);

  /**
   * Check if requested quantity is available in stock
   * @param variantId - Product variant ID
   * @param requestedQty - Quantity user wants to add/update
   * @param freedQty - Quantity that will be freed from old invoice (for edit mode)
   * @returns StockCheckResult with availability status
   */
  const checkStock = useCallback(async (
    variantId: string,
    requestedQty: number,
    freedQty: number = 0
  ): Promise<StockCheckResult> => {
    setChecking(true);
    try {
      if (!currentOrganization?.id) {
        throw new Error("No organization selected");
      }

      const { data: variant, error } = await supabase
        .from("product_variants")
        .select(`
          stock_qty,
          size,
          products (
            product_name,
            product_type
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("id", variantId)
        .single();

      if (error) throw error;

      const productName = (variant.products as any)?.product_name || "Product";
      const productType = (variant.products as any)?.product_type || "goods";

      // Service and combo products don't track stock - always available
      if (productType === 'service' || productType === 'combo') {
        return {
          isAvailable: true,
          availableStock: 999999, // Unlimited for services
          productName,
          size: variant.size,
        };
      }

      // Available stock = current stock + stock that will be freed from old invoice
      const availableStock = (variant.stock_qty || 0) + freedQty;

      return {
        isAvailable: availableStock >= requestedQty,
        availableStock,
        productName,
        size: variant.size,
      };
    } catch (error) {
      console.error("Stock validation error:", error);
      toast({
        title: "Error",
        description: "Failed to check stock availability",
        variant: "destructive",
      });
      return {
        isAvailable: false,
        availableStock: 0,
        productName: "Unknown",
        size: "",
      };
    } finally {
      setChecking(false);
    }
  }, [toast, currentOrganization?.id]);

  /**
   * Validate stock for multiple items in a cart/invoice
   * Returns array of items that exceed available stock
   * @param items - New items to validate
   * @param oldItems - Old items from existing invoice (for edit mode) - stock from these will be considered "freed"
   */
  const validateCartStock = useCallback(async (
    items: Array<{ variantId: string; quantity: number; productName?: string; size?: string }>,
    oldItems?: Array<{ variantId: string; quantity: number }>
  ): Promise<Array<{ productName: string; size: string; requested: number; available: number }>> => {
    setChecking(true);
    const insufficientItems: Array<{ productName: string; size: string; requested: number; available: number }> = [];

  // STEP 1: Aggregate new items by variantId to handle same variant appearing multiple times
    // IMPORTANT: Skip items without variantId (custom sizes don't track stock)
    const aggregatedNewItems = new Map<string, { variantId: string; quantity: number; productName?: string; size?: string }>();
    for (const item of items) {
      // Skip items without variantId (custom sizes don't track stock)
      if (!item.variantId) continue;
      
      const existing = aggregatedNewItems.get(item.variantId);
      if (existing) {
        existing.quantity += item.quantity;
        // Keep the first product name and size
      } else {
        aggregatedNewItems.set(item.variantId, { ...item });
      }
    }

    // STEP 2: Create a map of freed quantities from old items
    // IMPORTANT: Skip items without variantId (custom sizes don't track stock)
    const freedQtyMap = new Map<string, number>();
    if (oldItems && oldItems.length > 0) {
      for (const oldItem of oldItems) {
        // Skip items without variantId
        if (!oldItem.variantId) continue;
        
        const currentFreed = freedQtyMap.get(oldItem.variantId) || 0;
        freedQtyMap.set(oldItem.variantId, currentFreed + oldItem.quantity);
      }
    }

    // Debug logging disabled in production to reduce overhead
    if (import.meta.env.DEV) {
      console.log('[Stock Validation] Starting validation:', {
        totalNewItems: items.length,
        aggregatedVariants: aggregatedNewItems.size,
        oldItemsCount: oldItems?.length || 0,
        freedVariants: freedQtyMap.size,
      });
    }

    try {
      if (!currentOrganization?.id) {
        throw new Error("No organization selected");
      }

      const variantIds = [...aggregatedNewItems.keys()];
      if (variantIds.length === 0) return insufficientItems;

      // Single round-trip for all variants (was N sequential queries — major save delay on large carts)
      const { data: variants, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          stock_qty,
          size,
          products (
            product_name,
            product_type
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .in("id", variantIds);

      if (error) throw error;

      const variantById = new Map((variants || []).map((v) => [v.id, v]));

      for (const [variantId, item] of aggregatedNewItems) {
        const freedQty = freedQtyMap.get(variantId) || 0;
        const additionalQtyNeeded = item.quantity - freedQty;
        if (additionalQtyNeeded <= 0) continue;

        const variant = variantById.get(variantId);
        const productName =
          (variant?.products as { product_name?: string } | null)?.product_name ||
          item.productName ||
          "Product";
        const productType =
          (variant?.products as { product_type?: string } | null)?.product_type || "goods";
        const size = variant?.size || item.size || "";

        if (productType === "service" || productType === "combo") continue;

        const availableStock = (variant?.stock_qty || 0) + freedQty;
        if (availableStock < additionalQtyNeeded) {
          insufficientItems.push({
            productName,
            size,
            requested: item.quantity,
            available: availableStock,
          });
        }
      }
    } catch (error) {
      console.error("Stock validation error:", error);
      toast({
        title: "Error",
        description: "Failed to check stock availability",
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }

    return insufficientItems;
  }, [toast, currentOrganization?.id]);

  /**
   * Show toast notification for stock validation errors
   */
  const showStockError = useCallback((
    productName: string,
    size: string,
    requested: number,
    available: number
  ) => {
    if (available === 0) {
      toast({
        title: "Out of Stock",
        description: `${productName} (${size}) is out of stock`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Insufficient Stock",
        description: `${productName} (${size}): Only ${available} units available (requested: ${requested})`,
        variant: "destructive",
      });
    }
  }, [toast]);

  /**
   * Show toast for multiple items with insufficient stock
   */
  const showMultipleStockErrors = useCallback((
    items: Array<{ productName: string; size: string; requested: number; available: number }>
  ) => {
    if (items.length === 0) return;

    const message = items
      .map(
        (item) =>
          `${item.productName} (${item.size}): ${item.available} available, ${item.requested} requested`
      )
      .join("\n");

    toast({
      title: `Insufficient Stock (${items.length} items)`,
      description: message,
      variant: "destructive",
    });
  }, [toast]);

  return {
    checkStock,
    validateCartStock,
    showStockError,
    showMultipleStockErrors,
    checking,
  };
};
