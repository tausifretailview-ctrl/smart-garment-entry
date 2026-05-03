import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useProductProtection } from "@/hooks/useProductProtection";
import { logError } from "@/lib/errorLogger";
import {
  recordPurchaseJournalEntry,
  recordPurchaseReturnJournalEntry,
  repostJournalForRestoredVoucher,
  recordSaleJournalEntry,
  recordSaleReturnJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

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
        case "purchase_bills": {
          const { error: pbError } = await supabase.rpc("restore_purchase_bill", { p_bill_id: id });
          if (pbError) throw pbError;
          const { data: billRow } = await supabase
            .from("purchase_bills")
            .select("organization_id, net_amount, paid_amount, bill_date")
            .eq("id", id)
            .maybeSingle();
          if (billRow?.organization_id) {
            const { data: setB } = await supabase
              .from("settings")
              .select("accounting_engine_enabled")
              .eq("organization_id", billRow.organization_id)
              .maybeSingle();
            if (isAccountingEngineEnabled(setB as { accounting_engine_enabled?: boolean } | null)) {
              try {
                const billYmd =
                  billRow.bill_date != null ? String(billRow.bill_date).slice(0, 10) : undefined;
                await recordPurchaseJournalEntry(
                  id,
                  billRow.organization_id,
                  Number(billRow.net_amount) || 0,
                  Number(billRow.paid_amount ?? 0),
                  "pay_later",
                  supabase,
                  billYmd
                );
              } catch (glErr) {
                console.error("Repost Purchase journal after restore:", glErr);
                toast({
                  title: "Ledger warning",
                  description:
                    "Purchase bill was restored but the day book entry could not be reposted. Check Journal Vouchers or contact support.",
                  variant: "destructive",
                });
              }
            }
          }
          break;
        }

        case "sales": {
          const { error: saleRestErr } = await supabase.rpc("restore_sale", { p_sale_id: id });
          if (saleRestErr) throw saleRestErr;
          const { data: saleRow } = await supabase
            .from("sales")
            .select("organization_id, net_amount, paid_amount, payment_method, sale_date")
            .eq("id", id)
            .maybeSingle();
          if (saleRow?.organization_id) {
            const { data: setS } = await supabase
              .from("settings")
              .select("accounting_engine_enabled")
              .eq("organization_id", saleRow.organization_id)
              .maybeSingle();
            if (isAccountingEngineEnabled(setS as { accounting_engine_enabled?: boolean } | null)) {
              try {
                const saleYmd =
                  saleRow.sale_date != null ? String(saleRow.sale_date).slice(0, 10) : undefined;
                await recordSaleJournalEntry(
                  id,
                  saleRow.organization_id,
                  Number(saleRow.net_amount) || 0,
                  Number(saleRow.paid_amount ?? 0),
                  String(saleRow.payment_method || "cash"),
                  supabase,
                  saleYmd
                );
              } catch (glErr) {
                console.error("Repost Sale journal after restore:", glErr);
                toast({
                  title: "Ledger warning",
                  description:
                    "Sale was restored but the day book entry could not be reposted. Check Journal Vouchers or contact support.",
                  variant: "destructive",
                });
              }
            }
          }
          break;
        }

        case "sale_returns":
          const { error: srError } = await supabase.rpc("restore_sale_return", { p_return_id: id });
          if (srError) throw srError;
          {
            const { data: srRow } = await supabase
              .from("sale_returns")
              .select("organization_id, net_amount, refund_type, return_date, return_number, payment_method")
              .eq("id", id)
              .maybeSingle();
            if (srRow?.organization_id) {
              const { data: setSr } = await supabase
                .from("settings")
                .select("accounting_engine_enabled")
                .eq("organization_id", srRow.organization_id)
                .maybeSingle();
              if (isAccountingEngineEnabled(setSr as { accounting_engine_enabled?: boolean } | null)) {
                try {
                  await recordSaleReturnJournalEntry(
                    id,
                    srRow.organization_id,
                    Number(srRow.net_amount) || 0,
                    srRow.refund_type || "credit_note",
                    srRow.return_date || new Date().toISOString().slice(0, 10),
                    `Sale return ${srRow.return_number || id.slice(0, 8)}`,
                    supabase,
                    srRow.payment_method ?? null
                  );
                  await supabase
                    .from("sale_returns")
                    .update({ journal_status: "posted", journal_error: null })
                    .eq("id", id);
                } catch (glErr) {
                  const errMsg = glErr instanceof Error ? glErr.message : String(glErr);
                  await supabase
                    .from("sale_returns")
                    .update({ journal_status: "failed", journal_error: errMsg.slice(0, 2000) })
                    .eq("id", id);
                  console.error("Repost SaleReturn journal after restore:", glErr);
                  toast({
                    title: "Ledger warning",
                    description:
                      "Return was restored but the day book entry could not be reposted. Check Journal Vouchers or contact support.",
                    variant: "destructive",
                  });
                }
              }
            }
          }
          break;

        case "purchase_returns":
          const { error: prError } = await supabase.rpc("restore_purchase_return", { p_return_id: id });
          if (prError) throw prError;
          {
            const { data: prRow } = await supabase
              .from("purchase_returns")
              .select("organization_id, net_amount, return_date, return_number, payment_method")
              .eq("id", id)
              .maybeSingle();
            if (prRow?.organization_id) {
              const { data: setPr } = await supabase
                .from("settings")
                .select("accounting_engine_enabled")
                .eq("organization_id", prRow.organization_id)
                .maybeSingle();
              if (isAccountingEngineEnabled(setPr as { accounting_engine_enabled?: boolean } | null)) {
                try {
                  await recordPurchaseReturnJournalEntry(
                    id,
                    prRow.organization_id,
                    Number(prRow.net_amount) || 0,
                    prRow.return_date || new Date().toISOString().slice(0, 10),
                    `Purchase return ${prRow.return_number || id.slice(0, 8)}`,
                    supabase,
                    prRow.payment_method ?? null
                  );
                  await supabase
                    .from("purchase_returns")
                    .update({ journal_status: "posted", journal_error: null })
                    .eq("id", id);
                } catch (glErr) {
                  const errMsg = glErr instanceof Error ? glErr.message : String(glErr);
                  await supabase
                    .from("purchase_returns")
                    .update({ journal_status: "failed", journal_error: errMsg.slice(0, 2000) })
                    .eq("id", id);
                  console.error("Repost PurchaseReturn journal after restore:", glErr);
                  toast({
                    title: "Ledger warning",
                    description:
                      "Purchase return was restored but the day book entry could not be reposted. Check Journal Vouchers or contact support.",
                    variant: "destructive",
                  });
                }
              }
            }
          }
          break;

        case "sale_orders":
          const { error: soError } = await supabase.rpc("restore_sale_order", { p_order_id: id });
          if (soError) throw soError;
          break;

        case "quotations":
          const { error: qError } = await supabase.rpc("restore_quotation", { p_quotation_id: id });
          if (qError) throw qError;
          break;

        case "voucher_entries": {
          const { error: vError } = await supabase.rpc("restore_voucher", { p_voucher_id: id });
          if (vError) throw vError;
          try {
            await repostJournalForRestoredVoucher(id, supabase);
          } catch (glErr) {
            console.error("Repost voucher journal after restore:", glErr);
            toast({
              title: "Ledger warning",
              description:
                "Voucher was restored but the day book entry could not be reposted. Check Journal Vouchers or contact support.",
              variant: "destructive",
            });
          }
          break;
        }

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
