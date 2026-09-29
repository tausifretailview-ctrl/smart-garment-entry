import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { ensureCreditNoteForSaleReturn } from "@/utils/ensureCreditNoteForSaleReturn";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { recordSaleReturnJournalEntry } from "@/utils/accounting/journalService";

/** Amount the typed S/R needs on top of the customer's saved return credit (0 = covered). */
export function manualSrShortfall(requested: number, availableCredit: number): number {
  const need = Math.round(((Number(requested) || 0) - (Number(availableCredit) || 0)) * 100) / 100;
  return need > 0.01 ? need : 0;
}

/**
 * POS "old sale return" that was never entered: record it as an amount-only sale
 * return (no items → stock unchanged) with a credit note, exactly like a Sale
 * Return saved as Credit Note. The POS S/R box then consumes it through the
 * normal credit path on bill save, so ledger and balance stay consistent.
 */
export async function createManualSaleReturnCredit(
  client: SupabaseClient,
  params: {
    organizationId: string;
    customerId: string;
    customerName: string;
    amount: number;
  },
): Promise<{ id: string; returnNumber: string }> {
  const amount = Math.round((Number(params.amount) || 0) * 100) / 100;
  if (amount <= 0.01) throw new Error("Enter an amount greater than 0");
  if (!params.customerId) throw new Error("Select a customer first");

  const { data: returnNumber, error: rnError } = await client.rpc("generate_sale_return_number", {
    p_organization_id: params.organizationId,
  });
  if (rnError) throw rnError;

  const returnDate = format(new Date(), "yyyy-MM-dd");
  const { data: created, error: insertError } = await client
    .from("sale_returns")
    .insert({
      return_number: returnNumber,
      organization_id: params.organizationId,
      customer_id: params.customerId,
      customer_name: params.customerName || "Customer",
      return_date: returnDate,
      gross_amount: amount,
      gst_amount: 0,
      net_amount: amount,
      refund_type: "credit_note",
      payment_method: null,
      credit_status: "pending",
      linked_sale_id: null,
      notes: "Old sale return (amount only, no items) — entered from POS S/R Adj",
    } as Record<string, unknown>)
    .select("id, return_number")
    .single();
  if (insertError) throw insertError;
  const id = String((created as { id: string }).id);

  let cnId: string | null = null;
  try {
    cnId = await ensureCreditNoteForSaleReturn(client, {
      organizationId: params.organizationId,
      saleReturnId: id,
      customerNameFallback: params.customerName,
      returnNumberFallback: String(returnNumber),
      creditAmountFallback: amount,
    });
    if (!cnId) throw new Error("Credit note could not be created");

    const { data: acct } = await client
      .from("settings")
      .select("accounting_engine_enabled")
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (isAccountingEngineEnabled(acct as { accounting_engine_enabled?: boolean } | null)) {
      await recordSaleReturnJournalEntry(
        id,
        params.organizationId,
        amount,
        "credit_note",
        returnDate,
        `Sale return ${String(returnNumber)} (old, amount only)`,
        client,
        null,
      );
      await client.from("sale_returns").update({ journal_status: "posted", journal_error: null }).eq("id", id);
    }
  } catch (err) {
    // Nothing half-made: remove the new credit note and return (no items were added).
    // Return first: it points at the credit note.
    await client.from("sale_returns").delete().eq("id", id);
    if (cnId) await client.from("credit_notes").delete().eq("id", cnId);
    throw err;
  }

  return { id, returnNumber: String(returnNumber) };
}
