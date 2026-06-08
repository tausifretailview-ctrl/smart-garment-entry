import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllSuppliers } from "@/utils/fetchAllRows";
import { useOrgLedgerReferenceData } from "@/hooks/useOrgLedgerReferenceData";

export type AccountsPaymentTabId =
  | "customer-payment"
  | "supplier-payment"
  | "expenses"
  | "employee-salary";

async function fetchAllVoucherEntries(organizationId: string) {
  const allVouchers: any[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("voucher_entries")
      .select(
        "id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, reference_id, payment_method, discount_amount, discount_reason, created_at, category, paid_by, receipt_number"
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allVouchers.push(...data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }
  return allVouchers;
}

export function useAccountsVoucherData(
  organizationId: string | undefined,
  activeTab: AccountsPaymentTabId,
  enabled: boolean,
  loadAllParties = false
) {
  const orgReady = !!organizationId && enabled;

  const { data: vouchers, isLoading: vouchersLoading } = useQuery({
    queryKey: ["voucher-entries", organizationId],
    queryFn: () => fetchAllVoucherEntries(organizationId!),
    enabled: orgReady,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const needsSales = loadAllParties || activeTab === "customer-payment";
  const needsCustomers = loadAllParties || activeTab === "customer-payment";

  const { customers, salesSummary: sales } = useOrgLedgerReferenceData(organizationId, {
    enabled: orgReady,
    loadCustomers: needsCustomers,
    loadSalesSummary: needsSales,
  });

  const needsSuppliers = activeTab === "supplier-payment";
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", organizationId],
    queryFn: () => fetchAllSuppliers(organizationId!),
    enabled: orgReady && needsSuppliers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const needsEmployees = loadAllParties || activeTab === "employee-salary";
  const { data: employees } = useQuery({
    queryKey: ["employees", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_name, designation")
        .eq("organization_id", organizationId!)
        .order("employee_name");
      if (error) throw error;
      return data || [];
    },
    enabled: orgReady && needsEmployees,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    vouchers,
    vouchersLoading,
    sales,
    customers,
    suppliers,
    employees,
  };
}
