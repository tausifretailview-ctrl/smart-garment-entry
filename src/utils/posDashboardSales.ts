import { supabase } from "@/integrations/supabase/client";
import { localDayEndUtcIso, localDayStartUtcIso } from "@/lib/localDayBounds";

export type PosDashboardCreditNoteUsage = Record<
  string,
  { credit_amount: number; used_amount: number; status: string }
>;

export type PosDashboardSalesPayload = {
  sales: any[];
  creditNoteUsage: PosDashboardCreditNoteUsage;
};

export async function fetchPosDashboardSales(
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<PosDashboardSalesPayload> {
  const allSales: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("sales")
      .select("*, customers:customer_id (gst_number)")
      .eq("organization_id", organizationId)
      .in("sale_type", ["pos", "delivery_challan"])
      .is("deleted_at", null);

    const startIso = localDayStartUtcIso(startDate);
    const endIso = localDayEndUtcIso(endDate);
    if (startIso) query = query.gte("sale_date", startIso);
    if (endIso) query = query.lte("sale_date", endIso);

    const { data, error } = await query
      .order("sale_date", { ascending: false })
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allSales.push(...data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  const creditNoteUsage: PosDashboardCreditNoteUsage = {};
  const saleIdsForCN = allSales.map((s: { id: string }) => s.id);
  if (saleIdsForCN.length > 0) {
    const cnBatchSize = 500;
    const cnBySaleId: Record<string, any> = {};
    for (let i = 0; i < saleIdsForCN.length; i += cnBatchSize) {
      const batch = saleIdsForCN.slice(i, i + cnBatchSize);
      if (batch.length === 0) continue;
      const { data: cnData } = await supabase
        .from("credit_notes")
        .select("id, sale_id, credit_amount, used_amount, status")
        .in("sale_id", batch)
        .is("deleted_at", null);
      cnData?.forEach((c: any) => {
        if (c.sale_id) cnBySaleId[c.sale_id] = c;
      });
    }

    allSales.forEach((s: any) => {
      const cn = cnBySaleId[s.id];
      if (cn) {
        s.credit_note_id = s.credit_note_id || cn.id;
        s.credit_note_amount = s.credit_note_amount || cn.credit_amount || 0;
        creditNoteUsage[cn.id] = {
          credit_amount: cn.credit_amount || 0,
          used_amount: cn.used_amount || 0,
          status: cn.status,
        };
      }
    });

    const directCnIds = allSales
      .map((s: any) => s.credit_note_id)
      .filter((id: string | null) => id && !creditNoteUsage[id]);
    if (directCnIds.length > 0) {
      const { data: directCN } = await supabase
        .from("credit_notes")
        .select("id, credit_amount, used_amount, status")
        .in("id", directCnIds);
      directCN?.forEach((c: any) => {
        creditNoteUsage[c.id] = {
          credit_amount: c.credit_amount || 0,
          used_amount: c.used_amount || 0,
          status: c.status,
        };
      });
    }
  }

  return { sales: allSales, creditNoteUsage };
}
