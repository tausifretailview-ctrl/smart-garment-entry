import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import {
  creditNoteLiveRemaining,
  ensureCreditNoteHeadroom,
  resolveCnAvailableFromRows,
} from "@/utils/saleReturnCnBalance";

/**
 * Ensures a `credit_notes` row exists for a sale return and links `sale_returns.credit_note_id`.
 * Same rules as AdjustCustomerCreditNoteDialog.ensureCreditNoteIdForReturn.
 */
export async function ensureCreditNoteForSaleReturn(
  client: SupabaseClient,
  params: {
    organizationId: string;
    saleReturnId: string;
    /** Optional: validate before loading sale return */
    creditNoteIdHint?: string | null;
    customerNameFallback?: string;
    returnNumberFallback?: string;
    creditAmountFallback?: number;
  },
): Promise<string | null> {
  const {
    organizationId,
    saleReturnId,
    creditNoteIdHint,
    customerNameFallback,
    returnNumberFallback,
    creditAmountFallback,
  } = params;

  const hint = String(creditNoteIdHint || "").trim();
  if (hint) {
    const { data: existingCn, error: existingCnError } = await client
      .from("credit_notes")
      .select("id")
      .eq("id", hint)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingCnError) throw existingCnError;
    if (existingCn?.id) return existingCn.id;
  }

  const { data: sr, error: srError } = await client
    .from("sale_returns")
    .select(
      "id, organization_id, customer_id, customer_name, return_number, return_date, net_amount, linked_sale_id, credit_note_id, credit_available_balance, credit_status",
    )
    .eq("id", saleReturnId)
    .eq("organization_id", organizationId)
    .single();
  if (srError) throw srError;

  const row = sr as {
    customer_id?: string | null;
    customer_name?: string | null;
    return_number?: string | null;
    return_date?: string | null;
    net_amount?: number | null;
    linked_sale_id?: string | null;
    credit_note_id?: string | null;
    credit_available_balance?: number | null;
    credit_status?: string | null;
  };

  const srLinkedCreditNoteId = String(row.credit_note_id || "").trim();
  if (srLinkedCreditNoteId) {
    const { data: linkedCn, error: linkedCnError } = await client
      .from("credit_notes")
      .select("id, credit_amount, used_amount")
      .eq("id", srLinkedCreditNoteId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (linkedCnError) throw linkedCnError;
    if (linkedCn?.id) {
      const cab =
        row.credit_available_balance != null && !Number.isNaN(Number(row.credit_available_balance))
          ? Math.max(0, Number(row.credit_available_balance))
          : null;
      const live = creditNoteLiveRemaining(linkedCn);
      if (cab != null && cab > live + 0.01) {
        await ensureCreditNoteHeadroom(client, {
          organizationId,
          creditNoteId: linkedCn.id,
          amountNeeded: cab,
          maxPoolFromReturn: Number(row.net_amount ?? creditAmountFallback ?? 0),
        });
      }
      return linkedCn.id;
    }
  }

  const { data: creditNoteNumber, error: numberError } = await client.rpc("generate_credit_note_number", {
    p_organization_id: organizationId,
  });
  if (numberError) throw numberError;

  const cabRaw = row.credit_available_balance;
  const cabN = cabRaw != null && !Number.isNaN(Number(cabRaw)) ? Number(cabRaw) : null;
  const netN = Number(row.net_amount ?? creditAmountFallback ?? 0);
  /** Match AdjustCustomerCreditNoteDialog: remainder after partial adjust is in credit_available_balance. */
  const insertAmount = Math.max(
    0,
    resolveCnAvailableFromRows(
      {
        id: saleReturnId,
        net_amount: netN,
        credit_available_balance: cabN,
        credit_note_id: null,
        credit_status: row.credit_status,
      },
      null,
    ),
  );

  const { data: newCN, error: createError } = await client
    .from("credit_notes")
    .insert({
      organization_id: organizationId,
      credit_note_number: creditNoteNumber,
      sale_id: row.linked_sale_id || null,
      customer_id: row.customer_id || null,
      customer_name: row.customer_name || customerNameFallback || "Walk-in Customer",
      credit_amount: insertAmount,
      used_amount: 0,
      status: "active",
      issue_date: row.return_date || format(new Date(), "yyyy-MM-dd"),
      notes: `Credit note from sale return ${row.return_number || returnNumberFallback || saleReturnId}`,
    } as Record<string, unknown>)
    .select("id")
    .single();
  if (createError) throw createError;

  const createdId = (newCN as { id?: string } | null)?.id;
  if (!createdId) return null;

  const { error: linkError } = await client
    .from("sale_returns")
    .update({ credit_note_id: createdId })
    .eq("id", saleReturnId)
    .eq("organization_id", organizationId);
  if (linkError) throw linkError;

  return createdId;
}
