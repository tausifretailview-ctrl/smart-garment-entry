import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  classifyCustomerSegment,
  fetchCustomerSaleStats,
} from "@/utils/customerSegments";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { resolveImportedOpeningBalance } from "@/lib/schoolFeeOpening";
import { adjustmentDueDelta } from "@/lib/schoolFeeLiability";

export async function invalidateCustomerAccountHistoryQueries(
  queryClient: QueryClient,
  customerId: string | null,
  organizationId: string | null,
) {
  const keys = [
    "customer-sales-history",
    "customer-payment-history",
    "customer-credit-notes-history",
    "customer-sale-returns-history",
    "customer-legacy-invoices",
    "customer-advances-history",
    "customer-adjustments-history",
    "customer-sale-stats",
    "school-customer-fees",
    "customer-balance",
    "customer-financial-snapshot",
    "customer-ledger",
    "voucher-entries",
    "sales",
    "customers-with-balance",
  ];
  await Promise.all(
    keys.map((key) =>
      queryClient.invalidateQueries({
        queryKey: [key],
        ...(customerId && organizationId ? { refetchType: "active" } : {}),
      }),
    ),
  );
  if (customerId && organizationId) {
    await queryClient.invalidateQueries({ queryKey: ["customer-account-page", customerId, organizationId] });
  }
}

export function getReturnCnAvailable(ret: {
  credit_note_id?: string | null;
  cn_live_remaining?: number | null;
  linked_sale_id?: string | null;
  credit_available_balance?: number | null;
  net_amount?: number | null;
}) {
  if (ret.credit_note_id && ret.cn_live_remaining != null) {
    return Number(ret.cn_live_remaining);
  }
  if (ret.linked_sale_id) {
    return Number(ret.credit_available_balance ?? 0);
  }
  return Number(ret.net_amount || 0);
}

export function canApplyReturnCreditNote(ret: {
  credit_status?: string | null;
  linked_sale_id?: string | null;
  credit_note_id?: string | null;
  cn_live_remaining?: number | null;
  credit_available_balance?: number | null;
  net_amount?: number | null;
}) {
  const status = ret.credit_status || "";
  if (status === "refunded") return false;
  if (status === "adjusted" && ret.linked_sale_id && getReturnCnAvailable(ret) <= 0) {
    return false;
  }
  return getReturnCnAvailable(ret) > 0;
}

export type UseCustomerAccountHistoryDataArgs = {
  customerId: string | null;
  organizationId: string | null;
  /** When false, tab/history queries do not run (modal closed). Balance hooks unchanged. */
  queriesEnabled: boolean;
};

export function useCustomerAccountHistoryData({
  customerId,
  organizationId,
  queriesEnabled,
}: UseCustomerAccountHistoryDataArgs) {
  const { isSchool } = useSchoolFeatures();
  const historyEnabled = queriesEnabled && !!customerId && !!organizationId;

  const {
    balance,
    openingBalance,
    totalSales,
    totalPaid,
    totalSalesGross,
    totalSaleReturnAdjustOnSales,
    totalCashPaid,
    totalAdvanceApplied,
    totalCnApplied,
    unusedAdvanceTotal,
    isLoading: balanceLoading,
  } = useCustomerBalance(customerId, organizationId);

  const {
    outstandingDr: snapshotOutstandingDr,
    advanceAvailable: snapshotAdvanceAvailable,
    cnAvailableTotal: snapshotCnAvailable,
  } = useCustomerFinancialSnapshot(customerId, organizationId);

  const { data: schoolFeeData } = useQuery({
    queryKey: ["school-customer-fees", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return null;
      const sel =
        "id, closing_fees_balance, class_id, is_new_admission, academic_year_id, fees_opening_is_net";
      let student: any = null;
      const { data: byCustomer } = await supabase
        .from("students")
        .select(sel)
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (byCustomer) student = byCustomer;
      else {
        const { data: byStudentId } = await supabase
          .from("students")
          .select(sel)
          .eq("id", customerId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        student = byStudentId;
      }
      if (!student) return null;

      const { data: allYears } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date")
        .eq("organization_id", organizationId)
        .order("start_date", { ascending: true });

      const { data: currentYear } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date")
        .eq("organization_id", organizationId)
        .eq("is_current", true)
        .maybeSingle();

      if (!currentYear?.id) {
        return {
          feesExpected: 0,
          feesPaid: 0,
          feesDue: 0,
          hasStructures: false,
          importedBalance: 0,
        };
      }

      const yearsChrono = [...(allYears || [])];
      const previousYear = currentYear.start_date
        ? yearsChrono
            .filter((y: any) => y.end_date && new Date(y.end_date) < new Date(currentYear.start_date as string))
            .sort(
              (a: any, b: any) =>
                new Date(b.end_date).getTime() - new Date(a.end_date).getTime(),
            )[0]
        : null;

      let latePrevPaid = 0;
      if (previousYear?.id) {
        const { data: lateFees } = await supabase
          .from("student_fees")
          .select("paid_amount, status")
          .eq("organization_id", organizationId)
          .eq("student_id", student.id)
          .eq("academic_year_id", previousYear.id)
          .in("status", ["paid", "partial"])
          .gt("paid_amount", 0);
        latePrevPaid = (lateFees || []).reduce(
          (s, f: any) => s + Number(f.paid_amount || 0),
          0,
        );
      }

      const importedOpening = resolveImportedOpeningBalance(
        Number(student.closing_fees_balance || 0),
        latePrevPaid,
        student.fees_opening_is_net === true && student.academic_year_id === currentYear.id,
      );

      let structureTotal = 0;
      if (student.class_id) {
        const { data: structures } = await supabase
          .from("fee_structures")
          .select("amount, frequency")
          .eq("organization_id", organizationId)
          .eq("academic_year_id", currentYear.id)
          .eq("class_id", student.class_id);
        structureTotal = (structures || []).reduce((sum, fs: any) => {
          const mult = fs.frequency === "monthly" ? 12 : fs.frequency === "quarterly" ? 4 : 1;
          return sum + fs.amount * mult;
        }, 0);
      }

      const yearName = currentYear.year_name as string | null;
      let liabilityGross: number;
      if (student.is_new_admission === true) {
        liabilityGross = importedOpening;
      } else if (structureTotal > 0) {
        liabilityGross = structureTotal + importedOpening;
      } else if (yearName === "2025-26" && importedOpening > 0) {
        liabilityGross = importedOpening;
      } else {
        liabilityGross = importedOpening;
      }

      const { data: adjustments } = await (supabase.from("student_balance_audit" as any) as any)
        .select("adjustment_type, change_amount, old_balance, new_balance")
        .eq("organization_id", organizationId)
        .eq("student_id", student.id)
        .eq("academic_year_id", currentYear.id)
        .not("reason_code", "in", "(receipt_deleted,receipt_modified)");

      const adjustmentNet = (adjustments || []).reduce(
        (sum: number, a: any) => sum + adjustmentDueDelta(a),
        0,
      );

      const feesExpected = liabilityGross + adjustmentNet;

      const { data: paymentsCur } = await supabase
        .from("student_fees")
        .select("paid_amount, status")
        .eq("student_id", student.id)
        .eq("organization_id", organizationId)
        .eq("academic_year_id", currentYear.id)
        .neq("status", "deleted");

      const feesPaid = (paymentsCur || []).reduce((sum, p: any) => {
        if (p.status === "balance_adjustment") return sum;
        return sum + (p.paid_amount || 0);
      }, 0);

      const feesDue = Math.max(0, feesExpected - feesPaid);
      const hasStructures = structureTotal > 0 && student.is_new_admission !== true;

      return {
        feesExpected,
        feesPaid,
        feesDue,
        hasStructures,
        importedBalance: importedOpening,
      };
    },
    enabled: historyEnabled && isSchool,
  });

  const { data: salesHistory, isLoading: salesLoading } = useQuery({
    queryKey: ["customer-sales-history", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from("sales")
        .select(`
          id, sale_number, sale_date, net_amount, payment_status, paid_amount, sale_return_adjust, sale_type, refund_amount,
          discount_amount, flat_discount_amount, is_cancelled, cancelled_at, cancelled_reason,
          sale_items (
            id, product_name, size, color, quantity, unit_price, mrp, line_total, barcode
          )
        `)
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .or("payment_status.neq.hold,is_cancelled.eq.true")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: historyEnabled,
  });

  const { data: paymentHistory, isLoading: paymentsLoading } = useQuery({
    queryKey: ["customer-payment-history", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .not("sale_type", "eq", "delivery_challan");

      const saleIds = (sales || []).map((s) => s.id);

      const { data, error } = await supabase
        .from("voucher_entries")
        .select(
          "id, voucher_number, voucher_date, voucher_type, total_amount, description, created_at, created_by, payment_method, reference_id, reference_type, receiving_bank_account_id",
        )
        .eq("organization_id", organizationId)
        .or("voucher_type.eq.receipt,voucher_type.eq.RECEIPT")
        .is("deleted_at", null)
        .or(
          saleIds.length > 0
            ? `reference_id.in.(${saleIds.join(",")}),and(reference_type.eq.customer,reference_id.eq.${customerId})`
            : `and(reference_type.eq.customer,reference_id.eq.${customerId})`,
        )
        .order("voucher_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: historyEnabled,
  });

  const { data: creditNotes, isLoading: creditNotesLoading } = useQuery({
    queryKey: ["customer-credit-notes-history", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from("credit_notes")
        .select("id, credit_note_number, issue_date, credit_amount, used_amount, status")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: historyEnabled,
  });

  const { data: saleReturns, isLoading: returnsLoading } = useQuery({
    queryKey: ["customer-sale-returns-history", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from("sale_returns")
        .select(
          "id, return_number, return_date, original_sale_number, net_amount, credit_status, linked_sale_id, credit_note_id, credit_available_balance, refund_type, customer_id",
        )
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("return_date", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const creditNoteIds = [...new Set(rows.map((r) => r.credit_note_id).filter(Boolean))] as string[];
      const cnLiveMap: Record<string, number> = {};
      if (creditNoteIds.length > 0) {
        const { data: cnRows } = await supabase
          .from("credit_notes")
          .select("id, credit_amount, used_amount")
          .eq("organization_id", organizationId)
          .in("id", creditNoteIds);
        (cnRows || []).forEach((cn) => {
          cnLiveMap[cn.id] = Math.max(0, Number(cn.credit_amount || 0) - Number(cn.used_amount || 0));
        });
      }
      return rows.map((row) => ({
        ...row,
        cn_live_remaining: row.credit_note_id ? cnLiveMap[row.credit_note_id] ?? null : null,
      }));
    },
    enabled: historyEnabled,
  });

  const { data: legacyInvoices, isLoading: legacyLoading } = useQuery({
    queryKey: ["customer-legacy-invoices", customerId, organizationId],
    queryFn: async () => {
      if (!organizationId || !customerId) return [];
      const { data, error } = await supabase
        .from("legacy_invoices")
        .select("id, invoice_number, customer_name, invoice_date, amount, payment_status, source")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .order("invoice_date", { ascending: false });
      if (error) {
        console.error("Error fetching legacy invoices:", error);
        return [];
      }
      return data || [];
    },
    enabled: historyEnabled,
  });

  const { data: customerAdvances, isLoading: advancesLoading } = useQuery({
    queryKey: ["customer-advances-history", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from("customer_advances")
        .select("id, advance_number, advance_date, amount, used_amount, payment_method, status")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .order("advance_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: historyEnabled,
  });

  const { data: balanceAdjustments, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ["customer-adjustments-history", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from("customer_balance_adjustments")
        .select("id, adjustment_date, reason, previous_outstanding, new_outstanding, outstanding_difference, previous_advance, new_advance, advance_difference")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .order("adjustment_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: historyEnabled,
  });

  const refunds = salesHistory?.filter((s) => (s.refund_amount || 0) > 0) || [];
  const isLoading = balanceLoading || salesLoading;

  const { data: customerSaleStats, isLoading: saleStatsLoading } = useQuery({
    queryKey: ["customer-sale-stats", customerId, organizationId],
    queryFn: () => fetchCustomerSaleStats(organizationId!, customerId!),
    enabled: historyEnabled && !isSchool,
    staleTime: 2 * 60 * 1000,
  });

  const customerSegment = useMemo(
    () => classifyCustomerSegment(customerSaleStats),
    [customerSaleStats],
  );

  const summary = useMemo(() => {
    const outstandingDr = snapshotOutstandingDr ?? balance;
    const advanceAvailable = snapshotAdvanceAvailable ?? unusedAdvanceTotal;
    const cnAvailable = snapshotCnAvailable ?? 0;
    const cnAppliedOnInvoices = Math.round(
      (totalSaleReturnAdjustOnSales || 0) + (totalCnApplied || 0),
    );
    return {
      outstandingDr,
      advanceAvailable,
      cnAvailable,
      cnAppliedOnInvoices,
    };
  }, [
    snapshotOutstandingDr,
    snapshotAdvanceAvailable,
    snapshotCnAvailable,
    balance,
    unusedAdvanceTotal,
    totalSaleReturnAdjustOnSales,
    totalCnApplied,
  ]);

  /** Same refund banner math as CustomerLedger (derived from snapshot + summary). */
  const refundableCreditBalance = useMemo(() => {
    if (isSchool) return 0;
    const unused = summary.advanceAvailable;
    const cn = summary.cnAvailable;
    const pool = unused + cn;
    const lifetimeSigned = summary.outstandingDr;
    if (lifetimeSigned < -0.5) {
      return Math.round(Math.min(pool, Math.abs(lifetimeSigned)));
    }
    const outstandingDr = Math.max(0, lifetimeSigned);
    return Math.round(Math.max(0, pool - outstandingDr));
  }, [isSchool, summary]);

  return {
    isSchool,
    schoolFeeData,
    balance,
    openingBalance,
    totalSales,
    totalSalesGross,
    totalCashPaid,
    summary,
    customerSegment,
    customerSaleStats,
    saleStatsLoading,
    salesHistory,
    salesLoading,
    paymentHistory,
    paymentsLoading,
    creditNotes,
    creditNotesLoading,
    saleReturns,
    returnsLoading,
    legacyInvoices,
    legacyLoading,
    customerAdvances,
    advancesLoading,
    balanceAdjustments,
    adjustmentsLoading,
    refunds,
    isLoading,
    refundableCreditBalance,
  };
}
