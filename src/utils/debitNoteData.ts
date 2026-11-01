import { supabase } from "@/integrations/supabase/client";
import {
  DEBIT_NOTE_SALE_TYPE,
  debitNoteTaxHeads,
  parseDebitNoteDetails,
  type DebitNoteDetails,
  type DebitNoteTaxHeads,
} from "@/utils/debitNote";

/** Stored GST lines of the given debit notes (sales ids), keyed by id. Chunked; no query when empty. */
export async function fetchDebitNoteDetailsByIds(ids: string[]): Promise<Map<string, DebitNoteDetails>> {
  const out = new Map<string, DebitNoteDetails>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, debit_note_details")
      .in("id", unique.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) {
      const d = parseDebitNoteDetails((row as { debit_note_details?: unknown }).debit_note_details);
      if (d) out.set(String(row.id), d);
    }
  }
  return out;
}

/**
 * Taxable value and GST of the debit notes dated in a period (GSTR-3B outward supplies).
 * Bounds are passed exactly as the caller filters sales.sale_date.
 */
export async function fetchPeriodDebitNoteTaxHeads(
  organizationId: string,
  fromIso: string,
  toIso: string,
): Promise<DebitNoteTaxHeads & { count: number }> {
  const total = { taxable: 0, gst: 0, igst: 0, cgst: 0, sgst: 0, count: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, debit_note_details")
      .eq("organization_id", organizationId)
      .eq("sale_type", DEBIT_NOTE_SALE_TYPE)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      // Database without the Phase 2 step 1 column cannot hold debit notes: nothing to add.
      if (/debit_note_details/i.test(error.message || "")) return total;
      throw error;
    }
    for (const row of data ?? []) {
      const d = parseDebitNoteDetails((row as { debit_note_details?: unknown }).debit_note_details);
      if (!d) continue;
      const h = debitNoteTaxHeads(d);
      total.taxable += h.taxable;
      total.gst += h.gst;
      total.igst += h.igst;
      total.cgst += h.cgst;
      total.sgst += h.sgst;
      total.count += 1;
    }
    if (!data || data.length < 1000) break;
  }
  return total;
}
