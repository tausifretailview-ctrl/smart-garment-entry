import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import type { OrganizationBankAccount } from "@/utils/organizationBankAccounts";

export const organizationBankAccountsQueryKey = (orgId: string | undefined) =>
  ["organization-bank-accounts", orgId] as const;

export type OrganizationBankAccountInput = {
  bank_name: string;
  account_holder?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  branch?: string | null;
  is_default?: boolean;
};

export function useOrganizationBankAccounts(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: organizationBankAccountsQueryKey(organizationId),
    queryFn: async () => {
      if (!organizationId) return [] as OrganizationBankAccount[];
      const { data, error } = await supabase
        .from("organization_bank_accounts")
        .select(
          "id, organization_id, bank_name, account_holder, account_number, ifsc_code, branch, is_default, created_at, updated_at, deleted_at",
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as OrganizationBankAccount[];
    },
    enabled: !!organizationId,
    staleTime: STALE_SETTINGS,
  });

  const invalidate = () => {
    if (organizationId) {
      queryClient.invalidateQueries({ queryKey: organizationBankAccountsQueryKey(organizationId) });
    }
  };

  const clearOtherDefaults = async (exceptId?: string) => {
    if (!organizationId) return;
    let q = supabase
      .from("organization_bank_accounts")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (exceptId) q = q.neq("id", exceptId);
    const { error } = await q;
    if (error) throw error;
  };

  const createAccount = useMutation({
    mutationFn: async (input: OrganizationBankAccountInput) => {
      if (!organizationId) throw new Error("No organization");
      const bankName = input.bank_name?.trim();
      if (!bankName) throw new Error("Bank name is required");
      const makeDefault = input.is_default === true || (query.data?.length ?? 0) === 0;
      if (makeDefault) await clearOtherDefaults();
      const { data, error } = await supabase
        .from("organization_bank_accounts")
        .insert({
          organization_id: organizationId,
          bank_name: bankName,
          account_holder: input.account_holder?.trim() || null,
          account_number: input.account_number?.trim() || null,
          ifsc_code: input.ifsc_code?.trim() || null,
          branch: input.branch?.trim() || null,
          is_default: makeDefault,
        })
        .select(
          "id, organization_id, bank_name, account_holder, account_number, ifsc_code, branch, is_default, created_at, updated_at, deleted_at",
        )
        .single();
      if (error) throw error;
      return data as OrganizationBankAccount;
    },
    onSuccess: invalidate,
  });

  const updateAccount = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: OrganizationBankAccountInput;
    }) => {
      if (!organizationId) throw new Error("No organization");
      const bankName = input.bank_name?.trim();
      if (!bankName) throw new Error("Bank name is required");
      if (input.is_default) await clearOtherDefaults(id);
      const { data, error } = await supabase
        .from("organization_bank_accounts")
        .update({
          bank_name: bankName,
          account_holder: input.account_holder?.trim() || null,
          account_number: input.account_number?.trim() || null,
          ifsc_code: input.ifsc_code?.trim() || null,
          branch: input.branch?.trim() || null,
          is_default: input.is_default === true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .select(
          "id, organization_id, bank_name, account_holder, account_number, ifsc_code, branch, is_default, created_at, updated_at, deleted_at",
        )
        .single();
      if (error) throw error;
      return data as OrganizationBankAccount;
    },
    onSuccess: invalidate,
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("No organization");
      const { error } = await supabase
        .from("organization_bank_accounts")
        .update({ deleted_at: new Date().toISOString(), is_default: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setDefaultAccount = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("No organization");
      await clearOtherDefaults(id);
      const { error } = await supabase
        .from("organization_bank_accounts")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
  };
}
