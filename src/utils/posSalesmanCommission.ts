/**
 * Salesman commission rows for a freshly saved POS bill.
 * Used by desktop POS (with its cached staff and rules) and the phone / offline POS.
 * Non-blocking: errors are logged, never thrown, so the sale itself is never affected.
 */
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorLogger";
import { buildSalesmanCommissionRecords } from "@/utils/salesmanCommissionLineRepair";

export async function recordPosSalesmanCommission(input: {
  organizationId: string;
  saleId: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  salesmanName: string;
  totalNetAmount: number;
  /** Already-loaded active staff / commission rules (desktop POS caches both); read when absent. */
  employees?: unknown[];
  rules?: unknown[];
}): Promise<void> {
  try {
    const orgId = input.organizationId;
    const [{ data: employees }, rulesRes, { data: saleItems }] = await Promise.all([
      input.employees
        ? Promise.resolve({ data: input.employees })
        : supabase
            .from("employees")
            .select("id, employee_name, designation, commission_percent")
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .eq("status", "active"),
      input.rules
        ? Promise.resolve({ data: input.rules, error: null })
        : (supabase.from("commission_rules" as any) as any)
            .select("id, employee_id, employee_name, rule_type, rule_value, commission_percent")
            .eq("organization_id", orgId)
            .eq("is_active", true),
      supabase
        .from("sale_items")
        .select("product_id, product_name, quantity, line_total, discount_share, net_after_discount, salesman")
        .eq("sale_id", input.saleId)
        .eq("organization_id", orgId)
        .is("deleted_at", null),
    ]);

    const productIds = [...new Set((saleItems || []).map((item) => item.product_id).filter(Boolean))];
    const productMap: Record<string, { brand?: string | null; category?: string | null; style?: string | null }> = {};
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, brand, category, style")
        .eq("organization_id", orgId)
        .in("id", productIds);
      (prods || []).forEach((product) => {
        productMap[product.id] = product;
      });
    }

    const records = buildSalesmanCommissionRecords({
      organizationId: orgId,
      saleId: input.saleId,
      saleNumber: input.saleNumber,
      saleDate: input.saleDate,
      customerName: input.customerName,
      headerSalesman: input.salesmanName,
      totalNetAmount: input.totalNetAmount,
      items: saleItems || [],
      productsById: productMap,
      employees: (employees || []) as never[],
      rules: (rulesRes?.error ? [] : rulesRes?.data || []) as never[],
    });
    if (records.length === 0) return;
    const { error: commissionError } = await (supabase.from("salesman_commissions" as any) as any).insert(records);
    if (commissionError) throw commissionError;
  } catch (err) {
    // Non-blocking for the bill, but visible in Admin Health (commission reports would miss it).
    void logError({ operation: "pos:salesman-commission", organizationId: input.organizationId, additionalContext: { sale_id: input.saleId } }, err);
  }
}
