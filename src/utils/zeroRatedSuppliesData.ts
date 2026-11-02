import { supabase } from "@/integrations/supabase/client";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { saleSupplyTypeOf } from "@/utils/industrialMode";
import { zeroRatedOutward, type ZeroRatedOutward } from "@/utils/zeroRatedSupplies";

/**
 * Export / SEZ bills of a period for GSTR-3B 3.1(b). Picks the same bills as get_gst_summary
 * (bill date as the database's calendar day, not deleted or cancelled, net ≥ 0, DC lines out)
 * so the amounts can be moved out of its CGST / SGST total. Call only with Industrial mode on.
 */
export async function fetchPeriodZeroRatedOutward(
  organizationId: string,
  fromYmd: string,
  toYmd: string,
): Promise<ZeroRatedOutward> {
  const bills: Array<{ id: string; tax_type: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, tax_type, b2b_details")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .gte("net_amount", 0)
      .not("b2b_details", "is", null)
      .gte("sale_date", `${fromYmd}T00:00:00Z`)
      .lte("sale_date", `${toYmd}T23:59:59.999Z`)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; tax_type: string | null; b2b_details: unknown }>) {
      if (saleSupplyTypeOf(row.b2b_details) !== "B2B") bills.push({ id: String(row.id), tax_type: row.tax_type });
    }
    if (!data || data.length < 1000) break;
  }
  if (bills.length === 0) return { taxable: 0, igst: 0, count: 0 };

  // Paged per 200 bills, so long industrial bills (over 1000 lines in a batch) are not cut off.
  const items = await fetchAllSaleItems(bills.map((b) => b.id));
  const linesBySale = new Map<string, Array<{ line_total: number | null; gst_percent: number | null }>>();
  for (const item of items as Array<{ sale_id: string; line_total: number | null; gst_percent: number | null; is_dc_item: boolean | null }>) {
    if (item.is_dc_item === true) continue;
    const list = linesBySale.get(String(item.sale_id)) || [];
    list.push({ line_total: item.line_total, gst_percent: item.gst_percent });
    linesBySale.set(String(item.sale_id), list);
  }
  return zeroRatedOutward(bills.map((b) => ({ tax_type: b.tax_type, lines: linesBySale.get(b.id) || [] })));
}
