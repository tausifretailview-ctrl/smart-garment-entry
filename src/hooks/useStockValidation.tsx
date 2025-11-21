import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StockCheckResult {
  isAvailable: boolean;
  availableStock: number;
  productName: string;
  size: string;
}

/**
 * Hook for real-time stock validation to prevent overselling
 * Checks available stock before allowing transactions
 */
export const useStockValidation = () => {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);

  /**
   * Check if requested quantity is available in stock
   * @param variantId - Product variant ID
   * @param requestedQty - Quantity user wants to add/update
   * @returns StockCheckResult with availability status
   */
  const checkStock = useCallback(async (
    variantId: string,
    requestedQty: number
  ): Promise<StockCheckResult> => {
    setChecking(true);
    try {
      const { data: variant, error } = await supabase
        .from("product_variants")
        .select(`
          stock_qty,
          size,
          products (
            product_name
          )
        `)
        .eq("id", variantId)
        .single();

      if (error) throw error;

      const availableStock = variant.stock_qty || 0;
      const productName = (variant.products as any)?.product_name || "Product";

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
  }, [toast]);

  /**
   * Validate stock for multiple items in a cart/invoice
   * Returns array of items that exceed available stock
   */
  const validateCartStock = useCallback(async (
    items: Array<{ variantId: string; quantity: number; productName?: string; size?: string }>
  ): Promise<Array<{ productName: string; size: string; requested: number; available: number }>> => {
    setChecking(true);
    const insufficientItems: Array<{ productName: string; size: string; requested: number; available: number }> = [];

    try {
      for (const item of items) {
        const result = await checkStock(item.variantId, item.quantity);
        if (!result.isAvailable) {
          insufficientItems.push({
            productName: item.productName || result.productName,
            size: item.size || result.size,
            requested: item.quantity,
            available: result.availableStock,
          });
        }
      }
    } finally {
      setChecking(false);
    }

    return insufficientItems;
  }, [checkStock]);

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
