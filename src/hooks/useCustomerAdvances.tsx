import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  recordCustomerAdvanceReceiptJournalEntry,
} from "@/utils/accounting/journalService";

interface CustomerAdvance {
  id: string;
  advance_number: string;
  customer_id: string;
  amount: number;
  used_amount: number;
  advance_date: string;
  payment_method: string | null;
  cheque_number: string | null;
  transaction_id: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
}

interface CreateAdvanceData {
  customerId: string;
  amount: number;
  paymentMethod: string;
  description?: string;
  chequeNumber?: string;
  transactionId?: string;
  advanceDate: Date;
}

export function useCustomerAdvances(organizationId: string | null) {
  const queryClient = useQueryClient();

  // Fetch all advances for the organization
  const { data: advances, isLoading } = useQuery({
    queryKey: ["customer-advances", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("*, customers(customer_name, phone)")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as (CustomerAdvance & { customers: { customer_name: string; phone: string | null } })[];
    },
    enabled: !!organizationId,
  });

  // Fetch advances for a specific customer
  const fetchCustomerAdvances = async (customerId: string) => {
    const { data, error } = await supabase
      .from("customer_advances")
      .select("*")
      .eq("customer_id", customerId)
      .eq("organization_id", organizationId!)
      .order("advance_date", { ascending: true });

    if (error) throw error;
    return data as CustomerAdvance[];
  };

  // Get available advance balance for a customer
  const getAvailableAdvanceBalance = async (customerId: string): Promise<number> => {
    const { data, error } = await supabase
      .from("customer_advances")
      .select("amount, used_amount")
      .eq("customer_id", customerId)
      .eq("organization_id", organizationId!)
      .in("status", ["active", "partially_used"]);

    if (error) throw error;

    return data?.reduce((sum, adv) => {
      const available = (adv.amount || 0) - (adv.used_amount || 0);
      return sum + Math.max(0, available);
    }, 0) || 0;
  };

  // Create new advance
  const createAdvance = useMutation({
    mutationFn: async (data: CreateAdvanceData) => {
      // Generate advance number
      const { data: advanceNumber, error: numberError } = await supabase.rpc(
        "generate_advance_number",
        { p_organization_id: organizationId! }
      );

      if (numberError) throw numberError;

      const { data: advance, error } = await supabase
        .from("customer_advances")
        .insert({
          organization_id: organizationId!,
          advance_number: advanceNumber,
          customer_id: data.customerId,
          amount: data.amount,
          used_amount: 0,
          advance_date: format(data.advanceDate, "yyyy-MM-dd"),
          payment_method: data.paymentMethod,
          cheque_number: data.chequeNumber || null,
          transaction_id: data.transactionId || null,
          description: data.description || null,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      const adv = advance as CustomerAdvance & { id: string; advance_number: string; advance_date: string };
      const { data: acctAdv } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (
        Boolean((acctAdv as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled)
      ) {
        try {
          await recordCustomerAdvanceReceiptJournalEntry(
            adv.id,
            organizationId!,
            data.amount,
            data.paymentMethod,
            adv.advance_date || format(data.advanceDate, "yyyy-MM-dd"),
            data.description?.trim() || `Advance ${adv.advance_number}`,
            supabase
          );
        } catch (glErr) {
          await supabase.from("customer_advances").delete().eq("id", adv.id);
          throw glErr;
        }
      }

      return advance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      toast.success("Advance booking recorded successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to record advance: ${error.message}`);
    },
  });

  // Apply advance to an invoice (FIFO logic)
  const applyAdvance = useMutation({
    mutationFn: async ({ customerId, amountToApply }: { customerId: string; amountToApply: number }) => {
      // Get available advances in FIFO order
      const { data: availableAdvances, error: fetchError } = await supabase
        .from("customer_advances")
        .select("*")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId!)
        .in("status", ["active", "partially_used"])
        .order("advance_date", { ascending: true });

      if (fetchError) throw fetchError;

      let remainingAmount = amountToApply;
      const updates: { id: string; newUsedAmount: number; newStatus: string }[] = [];

      for (const advance of availableAdvances || []) {
        if (remainingAmount <= 0) break;

        const available = advance.amount - advance.used_amount;
        const toUse = Math.min(available, remainingAmount);

        const newUsedAmount = advance.used_amount + toUse;
        const newStatus = newUsedAmount >= advance.amount ? "fully_used" : "partially_used";

        updates.push({ id: advance.id, newUsedAmount, newStatus });
        remainingAmount -= toUse;
      }

      // Apply updates
      for (const update of updates) {
        const { error } = await supabase
          .from("customer_advances")
          .update({
            used_amount: update.newUsedAmount,
            status: update.newStatus,
          })
          .eq("id", update.id);

        if (error) throw error;
      }

      return { appliedAmount: amountToApply - remainingAmount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to apply advance: ${error.message}`);
    },
  });

  return {
    advances,
    isLoading,
    fetchCustomerAdvances,
    getAvailableAdvanceBalance,
    createAdvance,
    applyAdvance,
  };
}

// Hook to get advance balance for a specific customer
export function useCustomerAdvanceBalance(customerId: string | null, organizationId: string | null) {
  return useQuery({
    queryKey: ["customer-advance-balance", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return 0;

      const { data, error } = await supabase
        .from("customer_advances")
        .select("amount, used_amount")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .in("status", ["active", "partially_used"]);

      if (error) throw error;

      return data?.reduce((sum, adv) => {
        const available = (adv.amount || 0) - (adv.used_amount || 0);
        return sum + Math.max(0, available);
      }, 0) || 0;
    },
    enabled: !!customerId && !!organizationId,
  });
}
