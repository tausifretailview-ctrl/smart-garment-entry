import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

interface ResetProgress {
  currentStep: string;
  stepsCompleted: number;
  totalSteps: number;
}

interface DataCounts {
  products: number;
  product_variants: number;
  customers: number;
  suppliers: number;
  sales: number;
  sale_returns: number;
  purchase_bills: number;
  purchase_returns: number;
  quotations: number;
  sale_orders: number;
  employees: number;
  stock_movements: number;
}

export const useOrganizationReset = () => {
  const { currentOrganization } = useOrganization();
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState<ResetProgress | null>(null);

  // Calculate barcode starting value based on organization number
  const getBarcodeStartValue = (): number => {
    if (!currentOrganization) return 90001001;
    
    // Check if organization has a custom starting value in settings
    const settings = currentOrganization.settings as Record<string, any>;
    if (settings?.barcodeStartValue) {
      return settings.barcodeStartValue;
    }
    
    // Default pattern: {org_number}0001001 (e.g., org 9 = 90001001)
    // For safety, default to 90001001 if we can't determine
    return 90001001;
  };

  // Fetch data counts for the current organization
  const { data: dataCounts, isLoading: isLoadingCounts, refetch: refetchCounts } = useQuery({
    queryKey: ["organization-data-counts", currentOrganization?.id],
    queryFn: async (): Promise<DataCounts> => {
      if (!currentOrganization?.id) {
        return {
          products: 0,
          product_variants: 0,
          customers: 0,
          suppliers: 0,
          sales: 0,
          sale_returns: 0,
          purchase_bills: 0,
          purchase_returns: 0,
          quotations: 0,
          sale_orders: 0,
          employees: 0,
          stock_movements: 0,
        };
      }

      const orgId = currentOrganization.id;

      // Fetch counts in parallel
      const [
        productsRes,
        variantsRes,
        customersRes,
        suppliersRes,
        salesRes,
        saleReturnsRes,
        purchasesRes,
        purchaseReturnsRes,
        quotationsRes,
        saleOrdersRes,
        employeesRes,
        stockMovementsRes,
      ] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("product_variants").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("sale_returns").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("purchase_bills").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("purchase_returns").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("sale_orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      ]);

      return {
        products: productsRes.count || 0,
        product_variants: variantsRes.count || 0,
        customers: customersRes.count || 0,
        suppliers: suppliersRes.count || 0,
        sales: salesRes.count || 0,
        sale_returns: saleReturnsRes.count || 0,
        purchase_bills: purchasesRes.count || 0,
        purchase_returns: purchaseReturnsRes.count || 0,
        quotations: quotationsRes.count || 0,
        sale_orders: saleOrdersRes.count || 0,
        employees: employeesRes.count || 0,
        stock_movements: stockMovementsRes.count || 0,
      };
    },
    enabled: !!currentOrganization?.id,
  });

  const resetOrganization = async (): Promise<boolean> => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return false;
    }

    setIsResetting(true);
    setProgress({
      currentStep: "Starting reset...",
      stepsCompleted: 0,
      totalSteps: 1,
    });

    try {
      const barcodeStartValue = getBarcodeStartValue();

      setProgress({
        currentStep: "Deleting organization data...",
        stepsCompleted: 0,
        totalSteps: 1,
      });

      const { data, error } = await supabase.functions.invoke("reset-organization", {
        body: {
          organizationId: currentOrganization.id,
          barcodeStartValue,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || "Reset failed");
      }

      setProgress({
        currentStep: "Reset complete!",
        stepsCompleted: 1,
        totalSteps: 1,
      });

      // Refetch counts to show zeros
      await refetchCounts();

      toast.success("Organization data has been reset successfully", {
        description: `Barcode sequence reset to ${barcodeStartValue}`,
      });

      return true;
    } catch (error: any) {
      console.error("Reset organization error:", error);
      toast.error("Failed to reset organization data", {
        description: error.message,
      });
      return false;
    } finally {
      setIsResetting(false);
      setProgress(null);
    }
  };

  return {
    dataCounts,
    isLoadingCounts,
    resetOrganization,
    isResetting,
    progress,
    barcodeStartValue: getBarcodeStartValue(),
  };
};
