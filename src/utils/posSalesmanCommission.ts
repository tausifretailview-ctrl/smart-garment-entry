/**
 * Salesman commission rows for a freshly saved POS bill.
 * Same reads and insert as desktop POSSales createCommissionRecords — used by the phone POS.
 * Non-blocking: errors are logged, never thrown, so the sale itself is never affected.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildSalesmanCommissionRecords } from "@/utils/salesmanCommissionLineRepair";

export async function recordPosSalesmanCommission(input: {
  organizationId: string;
  saleId: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  salesmanName: string;
  totalNetAmount: number;
}): Promise<void> {
  try {
    const orgId = input.organizationId;
    const [{ data: employees }, rulesRes, { data: saleItems }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_name, designation, commission_percent")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .eq("status", "active"),
      (supabase.from("commission_rules" as any) as any)
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
      employees: employees || [],
      rules: rulesRes?.error ? [] : rulesRes?.data || [],
    });
    if (records.length === 0) return;
    await (supabase.from("salesman_commissions" as any) as any).insert(records);
  } catch (err) {
    console.error("Commission record failed (non-blocking):", err);
  }
}
