import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useProductProtection } from "@/hooks/useProductProtection";
import { logError } from "@/lib/errorLogger";

export type SoftDeleteEntity = 
  | "customers"
  | "suppliers"
  | "employees"
  | "products"
  | "purchase_bills"
  | "sales"
  | "sale_returns"
  | "purchase_returns"
  | "sale_orders"
  | "purchase_orders"
  | "quotations"
  | "voucher_entries"
  | "credit_notes";

export interface StockDependency {
  sale_id: string;
  sale_number: string;
  sale_date: string;
  product_name: string;
  size: string;
  quantity: number;
  would_go_negative: boolean;
  current_stock: number;
  purchased_qty: number;
}

export function useSoftDelete() {
  const { user } = useAuth();
  const { organizationRole } = useOrganization();
  const { toast } = useToast();
  const { checkVariantHasTransactions, checkProductHasTransactions } = useProductProtection();

  const softDelete = async (entity: SoftDeleteEntity, id: string) => {
    if (!user?.id) {
      toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
      return false;
    }

    try {
      switch (entity) {
        case "purchase_bills":
          const { error: pbError } = await supabase.rpc("soft_delete_purchase_bill", {
            p_bill_id: id,
            p_user_id: user.id,
          });
          if (pbError) throw pbError;
          break;

        case "sales":
          const { error: saleError } = await supabase.rpc("soft_delete_sale", {
            p_sale_id: id,
            p_user_id: user.id,
          });
          if (saleError) throw saleError;
          break;

        case "sale_returns":
          const { error: srError } = await supabase.rpc("soft_delete_sale_return", {
            p_return_id: id,
            p_user_id: user.id,
          });
          if (srError) throw srError;
          break;

        case "purchase_returns":
          const { error: prError } = await supabase.rpc("soft_delete_purchase_return", {
            p_return_id: id,
            p_user_id: user.id,
          });
          if (prError) throw prError;
          break;

        case "sale_orders":
          const { error: soError } = await supabase.rpc("soft_delete_sale_order", {
            p_order_id: id,
            p_user_id: user.id,
          });
          if (soError) throw soError;
          break;

        case "quotations":
          const { error: qError } = await supabase.rpc("soft_delete_quotation", {
            p_quotation_id: id,
            p_user_id: user.id,
          });
          if (qError) throw qError;
          break;

        case "voucher_entries":
          const { error: vError } = await supabase.rpc("soft_delete_voucher", {
            p_voucher_id: id,
            p_user_id: user.id,
          });
          if (vError) throw vError;
          break;

        default:
          const { error } = await supabase
            .from(entity)
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: user.id,
            })
            .eq("id", id);
          if (error) throw error;
      }

      return true;
    } catch (error: any) {
      logError(
        {
          operation: `entity_soft_delete_${entity}`,
          additionalContext: { entity, id },
        },
        error
      );
      console.error(`Error soft deleting ${entity}:`, error);
      toast({
        title: "Error",
        description: error.message || `Failed to delete ${entity}`,
        variant: "destructive",
      });
      return false;
    }
  };

  const bulkSoftDelete = async (entity: SoftDeleteEntity, ids: string[]) => {
    let successCount = 0;
    for (const id of ids) {
      const success = await softDelete(entity, id);
      if (success) successCount++;
    }
    return successCount;
  };

  const restore = async (entity: SoftDeleteEntity, id: string) => {
    try {
      switch (entity) {
        case "purchase_bills":
          const { error: pbError } = await supabase.rpc("restore_purchase_bill", { p_bill_id: id });
          if (pbError) throw pbError;
          break;

        case "sales":
          const { error: saleError } = await supabase.rpc("restore_sale", { p_sale_id: id });
          if (saleError) throw saleError;
          break;

        case "sale_returns":
          const { error: srError } = await supabase.rpc("restore_sale_return", { p_return_id: id });
          if (srError) throw srError;
          break;

        case "purchase_returns":
          const { error: prError } = await supabase.rpc("restore_purchase_return", { p_return_id: id });
          if (prError) throw prError;
          break;

        case "sale_orders":
          const { error: soError } = await supabase.rpc("restore_sale_order", { p_order_id: id });
          if (soError) throw soError;
          break;

        case "quotations":
          const { error: qError } = await supabase.rpc("restore_quotation", { p_quotation_id: id });
          if (qError) throw qError;
          break;

        case "voucher_entries":
          const { error: vError } = await supabase.rpc("restore_voucher", { p_voucher_id: id });
          if (vError) throw vError;
          break;

        default:
          const { error } = await supabase
            .from(entity)
            .update({
              deleted_at: null,
              deleted_by: null,
            })
            .eq("id", id);
          if (error) throw error;
      }

      return true;
    } catch (error: any) {
      console.error(`Error restoring ${entity}:`, error);
      toast({
        title: "Error",
        description: error.message || `Failed to restore ${entity}`,
        variant: "destructive",
      });
      return false;
    }
  };

  const hardDelete = async (entity: SoftDeleteEntity, id: string) => {
    if (!user?.id) {
      toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
      return false;
    }

    try {
      const protectedEntities: SoftDeleteEntity[] = [
        "purchase_bills",
        "sales",
        "sale_returns",
        "purchase_returns",
      ];
      const isAdminOrOwner = organizationRole === "admin";
      if (protectedEntities.includes(entity) && !isAdminOrOwner) {
        toast({
          title: "Permission Denied",
          description: "Only admin can permanently delete this record.",
          variant: "destructive",
        });
        return false;
      }

      // For products, check if it has transactions before allowing hard delete
      if (entity === "products") {
        const { hasTransactions, usedIn } = await checkProductHasTransactions(id);
        if (hasTransactions) {
          toast({
            title: "Cannot Delete Product",
            description: `This product is used in ${usedIn.join(", ")} and cannot be permanently deleted.`,
            variant: "destructive",
          });
          return false;
        }
      }

      // For entities with child items, delete children first
      switch (entity) {
        case "purchase_bills":
          await supabase.from("purchase_items").delete().eq("bill_id", id);
          await supabase.from("batch_stock").delete().eq("purchase_bill_id", id);
          break;
        case "sales":
          await supabase.from("sale_items").delete().eq("sale_id", id);
          break;
        case "sale_returns":
          await supabase.from("sale_return_items").delete().eq("return_id", id);
          break;
        case "purchase_returns":
          await supabase.from("purchase_return_items").delete().eq("return_id", id);
          break;
        case "sale_orders":
          await supabase.from("sale_order_items").delete().eq("order_id", id);
          break;
        case "quotations":
          await supabase.from("quotation_items").delete().eq("quotation_id", id);
          break;
        case "voucher_entries":
          await supabase.from("voucher_items").delete().eq("voucher_id", id);
          break;
        case "products":
          await supabase.from("product_variants").delete().eq("product_id", id);
          break;
      }

      // Delete the main record
      const { error } = await supabase.from(entity).delete().eq("id", id);
      if (error) throw error;

      return true;
    } catch (error: any) {
      logError(
        {
          operation: `entity_hard_delete_${entity}`,
          additionalContext: { entity, id },
        },
        error
      );
      console.error(`Error permanently deleting ${entity}:`, error);
      toast({
        title: "Error",
        description: error.message || `Failed to permanently delete ${entity}`,
        variant: "destructive",
      });
      return false;
    }
  };

  const checkPurchaseStockDependencies = async (billId: string): Promise<StockDependency[]> => {
    try {
      const { data, error } = await supabase.rpc("check_purchase_stock_dependencies", {
        p_bill_id: billId,
      });

      if (error) {
        console.error("Error checking stock dependencies:", error);
        return [];
      }

      return (data || []) as StockDependency[];
    } catch (error) {
      console.error("Error checking stock dependencies:", error);
      return [];
    }
  };

  return { softDelete, bulkSoftDelete, restore, hardDelete, checkPurchaseStockDependencies };
}
