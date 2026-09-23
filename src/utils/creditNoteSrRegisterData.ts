import { supabase } from "@/integrations/supabase/client";
import type {
  CreditNoteSrRegisterSaleReturn,
  CreditNoteSrRegisterSource,
  CreditNoteSrRegisterVoucher,
} from "@/utils/creditNoteSrRegister";

const PAGE = 1000;

async function fetchPaged<T>(
  run: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await run(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

/**
 * Org-wide sale returns + receipt vouchers + linked sales/CNs.
 * Remaining is computed by buildCreditNoteSrRegisterRows (Phase 1 helpers).
 */
export async function fetchCreditNoteSrRegisterSource(
  organizationId: string,
): Promise<CreditNoteSrRegisterSource> {
  if (!organizationId) {
    return {
      saleReturns: [],
      customersById: {},
      salesById: {},
      creditNotesById: {},
      vouchers: [],
    };
  }

  const saleReturns = await fetchPaged<CreditNoteSrRegisterSaleReturn>(async (from, to) => {
    const { data, error } = await supabase
      .from("sale_returns")
      .select(
        "id, return_number, return_date, created_at, customer_id, customer_name, net_amount, credit_status, linked_sale_id, credit_note_id, refund_type",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("return_date")
      .order("id")
      .range(from, to);
    return {
      data: (data || []) as CreditNoteSrRegisterSaleReturn[],
      error: error ? { message: error.message } : null,
    };
  });

  const vouchers = await fetchPaged<CreditNoteSrRegisterVoucher>(async (from, to) => {
    const { data, error } = await supabase
      .from("voucher_entries")
      .select(
        "voucher_type, payment_method, description, reference_id, total_amount, voucher_date, created_at, voucher_number",
      )
      .eq("organization_id", organizationId)
      .eq("voucher_type", "receipt")
      .is("deleted_at", null)
      .order("id")
      .range(from, to);
    return {
      data: (data || []) as CreditNoteSrRegisterVoucher[],
      error: error ? { message: error.message } : null,
    };
  });

  const saleIds = new Set<string>();
  const customerIds = new Set<string>();
  const cnIds = new Set<string>();
  for (const sr of saleReturns) {
    if (sr.linked_sale_id) saleIds.add(String(sr.linked_sale_id));
    if (sr.customer_id) customerIds.add(String(sr.customer_id));
    if (sr.credit_note_id) cnIds.add(String(sr.credit_note_id));
  }
  for (const v of vouchers) {
    if (v.reference_id) saleIds.add(String(v.reference_id));
  }

  const salesById: CreditNoteSrRegisterSource["salesById"] = {};
  const saleIdList = [...saleIds];
  for (let i = 0; i < saleIdList.length; i += PAGE) {
    const chunk = saleIdList.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_number, sale_type, sale_date, sale_return_adjust")
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const s of data || []) {
      salesById[s.id] = {
        sale_number: s.sale_number,
        sale_type: s.sale_type,
        sale_date: s.sale_date,
        sale_return_adjust: Number(s.sale_return_adjust) || 0,
      };
    }
  }

  const customersById: CreditNoteSrRegisterSource["customersById"] = {};
  const custList = [...customerIds];
  for (let i = 0; i < custList.length; i += PAGE) {
    const chunk = custList.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const c of data || []) {
      customersById[c.id] = { customer_name: c.customer_name, phone: c.phone };
    }
  }

  const creditNotesById: CreditNoteSrRegisterSource["creditNotesById"] = {};
  const cnList = [...cnIds];
  for (let i = 0; i < cnList.length; i += PAGE) {
    const chunk = cnList.slice(i, i + PAGE);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from("credit_notes")
      .select("id, credit_note_number, credit_amount")
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const c of data || []) {
      creditNotesById[c.id] = {
        credit_note_number: c.credit_note_number,
        credit_amount: Number(c.credit_amount) || 0,
      };
    }
  }

  return { saleReturns, customersById, salesById, creditNotesById, vouchers };
}
