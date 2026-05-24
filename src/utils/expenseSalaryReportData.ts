import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ExpenseSalaryReportRow = {
  id: string;
  date: string;
  type: "Expense" | "Salary";
  categoryOrEmployee: string;
  description: string;
  paymentMethod: string;
  amount: number;
  voucherNumber: string;
};

type VoucherLite = {
  id: string;
  voucher_date: string | null;
  voucher_number: string | null;
  voucher_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  category: string | null;
  description: string | null;
  payment_method: string | null;
  total_amount: number | null;
};

export const normalizeExpenseSalaryPaymentMethod = (raw?: string | null) => {
  const method = (raw || "").toLowerCase().trim();
  if (method === "upi") return "UPI";
  if (method === "card") return "Card";
  if (method === "cash") return "Cash";
  if (method.includes("bank")) return "Bank Transfer";
  if (method.includes("cheque") || method.includes("check")) return "Cheque";
  if (!method) return "Cash";
  return "Bank Transfer";
};

/**
 * Expenses: voucher_type = expense (Accounts → Expenses tab).
 * Salaries: voucher_type = payment + reference_type = employee (Employee Salary tab).
 * Aligns with P&L / historical GL backfill.
 */
export async function fetchExpenseSalaryReportRows(
  organizationId: string,
  fromDateStr: string,
  toDateStr: string,
  client: SupabaseClient = supabase,
): Promise<ExpenseSalaryReportRow[]> {
  const select =
    "id, voucher_date, voucher_number, voucher_type, reference_type, reference_id, category, description, payment_method, total_amount";

  const [expenseRes, salaryRes] = await Promise.all([
    client
      .from("voucher_entries")
      .select(select)
      .eq("organization_id", organizationId)
      .eq("voucher_type", "expense")
      .is("deleted_at", null)
      .gte("voucher_date", fromDateStr)
      .lte("voucher_date", toDateStr),
    client
      .from("voucher_entries")
      .select(select)
      .eq("organization_id", organizationId)
      .eq("voucher_type", "payment")
      .eq("reference_type", "employee")
      .is("deleted_at", null)
      .gte("voucher_date", fromDateStr)
      .lte("voucher_date", toDateStr),
  ]);

  if (expenseRes.error) throw expenseRes.error;
  if (salaryRes.error) throw salaryRes.error;

  const expenseVouchers = (expenseRes.data || []) as VoucherLite[];
  const salaryVouchers = (salaryRes.data || []) as VoucherLite[];

  const employeeIds = Array.from(
    new Set(salaryVouchers.map((v) => v.reference_id).filter(Boolean) as string[]),
  );

  let employeeNameById = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: employees, error: employeeErr } = await client
      .from("employees")
      .select("id, employee_name")
      .in("id", employeeIds);
    if (employeeErr) throw employeeErr;
    employeeNameById = new Map(
      (employees || []).map((e: { id: string; employee_name: string | null }) => [
        e.id,
        e.employee_name || "Employee",
      ]),
    );
  }

  const expenseRows: ExpenseSalaryReportRow[] = expenseVouchers.map((v) => ({
    id: v.id,
    date: v.voucher_date || "",
    type: "Expense",
    categoryOrEmployee: v.category || "Uncategorized",
    description: v.description || v.category || "",
    paymentMethod: normalizeExpenseSalaryPaymentMethod(v.payment_method),
    amount: Number(v.total_amount || 0),
    voucherNumber: v.voucher_number || "-",
  }));

  const salaryRows: ExpenseSalaryReportRow[] = salaryVouchers.map((v) => ({
    id: v.id,
    date: v.voucher_date || "",
    type: "Salary",
    categoryOrEmployee: employeeNameById.get(v.reference_id || "") || "Employee",
    description: v.description || "Salary Payment",
    paymentMethod: normalizeExpenseSalaryPaymentMethod(v.payment_method),
    amount: Number(v.total_amount || 0),
    voucherNumber: v.voucher_number || "-",
  }));

  return [...expenseRows, ...salaryRows];
}
