import type { SupabaseClient } from "@supabase/supabase-js";

export type SaleReturnCnRow = {
  id: string;
  net_amount?: number | null;
  credit_available_balance?: number | null;
  credit_note_id?: string | null;
  credit_status?: string | null;
};

export type CreditNoteLiveRow = {
  id: string;
  credit_amount?: number | null;
  used_amount?: number | null;
  credit_note_number?: string | null;
};

/** Live pool on `credit_notes` (what `adjust_invoice_balance` enforces). */
export function creditNoteLiveRemaining(cn: CreditNoteLiveRow | null | undefined): number {
  if (!cn) return 0;
  return Math.max(
    0,
    Math.round((Number(cn.credit_amount || 0) - Number(cn.used_amount || 0)) * 100) / 100,
  );
}

/**
 * Sale return was absorbed into an invoice at billing (`sales.sale_return_adjust`).
 * Re-applying its CN via Sale Return → Adjust or Sales → From Credit Note would
 * credit the customer twice for the same return (ELLA / SHAHIN pattern).
 */
export function isSaleReturnConsumedAtBilling(sr: {
  credit_status?: string | null;
  linked_sale_id?: string | null;
}): boolean {
  const status = String(sr.credit_status || "")
    .toLowerCase()
    .trim();
  const linked = String(sr.linked_sale_id || "").trim();
  return status === "adjusted" && linked.length > 0;
}

/**
 * Authoritative CN available for a sale return.
 * When a credit_notes row exists, its remaining balance wins over stale `credit_available_balance`.
 */
export function resolveCnAvailableFromRows(
  sr: SaleReturnCnRow,
  cn: CreditNoteLiveRow | null | undefined,
): number {
  const net = Math.max(0, Number(sr.net_amount || 0));
  const cabRaw = sr.credit_available_balance;
  const cab =
    cabRaw != null && !Number.isNaN(Number(cabRaw)) ? Math.max(0, Number(cabRaw)) : null;

  if (cn?.id) {
    return creditNoteLiveRemaining(cn);
  }

  if (cab != null) return Math.round(cab);
  const st = String(sr.credit_status || "").toLowerCase();
  if (st === "refunded") return 0;
  return Math.round(net);
}

export type ResolvedSaleReturnCn = {
  available: number;
  netAmount: number;
  creditAvailableBalance: number | null;
  creditNoteId: string | null;
  cnLiveRemaining: number | null;
  cabDrift: number;
};

export async function resolveSaleReturnCnAvailable(
  client: SupabaseClient,
  params: {
    organizationId: string;
    saleReturnId: string;
    /** When true, writes `sale_returns.credit_available_balance` to match credit_notes. */
    healCabDrift?: boolean;
  },
): Promise<ResolvedSaleReturnCn> {
  const { data: sr, error: srErr } = await client
    .from("sale_returns")
    .select("id, net_amount, credit_available_balance, credit_note_id, credit_status")
    .eq("id", params.saleReturnId)
    .eq("organization_id", params.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srErr) throw srErr;
  if (!sr) {
    return {
      available: 0,
      netAmount: 0,
      creditAvailableBalance: null,
      creditNoteId: null,
      cnLiveRemaining: null,
      cabDrift: 0,
    };
  }

  const row = sr as SaleReturnCnRow;
  let cn: CreditNoteLiveRow | null = null;
  const cnId = String(row.credit_note_id || "").trim();
  if (cnId) {
    const { data: cnRow, error: cnErr } = await client
      .from("credit_notes")
      .select("id, credit_amount, used_amount, credit_note_number")
      .eq("id", cnId)
      .eq("organization_id", params.organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (cnErr) throw cnErr;
    cn = cnRow as CreditNoteLiveRow | null;
  }

  const available = resolveCnAvailableFromRows(row, cn);
  const cabN =
    row.credit_available_balance != null && !Number.isNaN(Number(row.credit_available_balance))
      ? Math.max(0, Number(row.credit_available_balance))
      : null;
  const cnLive = cn ? creditNoteLiveRemaining(cn) : null;
  const cabDrift = cabN != null && cnLive != null ? cabN - cnLive : 0;

  if (params.healCabDrift && cnLive != null && Math.abs(cabDrift) > 0.01) {
    await client
      .from("sale_returns")
      .update({ credit_available_balance: cnLive })
      .eq("id", params.saleReturnId)
      .eq("organization_id", params.organizationId);
  }

  return {
    available,
    netAmount: Math.max(0, Number(row.net_amount || 0)),
    creditAvailableBalance: cabN,
    creditNoteId: cnId || null,
    cnLiveRemaining: cnLive,
    cabDrift,
  };
}

/**
 * `adjust_invoice_balance` checks `credit_notes.credit_amount - used_amount`.
 *
 * Heal-down policy: if the sale_return shows a larger pool than the CN header
 * actually has remaining, lower `sale_returns.credit_available_balance` down
 * to the CN's live remaining. We never inflate `credit_notes.credit_amount`
 * upward — that would silently grow CN headroom to paper over drift.
 *
 * Throws via `formatCnApplyError` if the requested amount truly exceeds the
 * CN's live remaining after the heal.
 */
export async function ensureCreditNoteHeadroom(
  client: SupabaseClient,
  params: {
    organizationId: string;
    creditNoteId: string;
    amountNeeded: number;
    maxPoolFromReturn?: number | null;
    saleReturnId?: string | null;
  },
): Promise<number> {
  const need = Math.max(0, Number(params.amountNeeded) || 0);
  if (need <= 0.01) return 0;

  const { data: cn, error } = await client
    .from("credit_notes")
    .select("id, credit_amount, used_amount, status")
    .eq("id", params.creditNoteId)
    .eq("organization_id", params.organizationId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;

  const used = Number(cn.used_amount || 0);
  const credit = Number(cn.credit_amount || 0);
  const remaining = Math.max(0, credit - used);

  // Heal-down: if the caller's sale-return pool is wider than the CN's live
  // remaining, narrow `sale_returns.credit_available_balance` to match.
  const cap =
    params.maxPoolFromReturn != null && !Number.isNaN(Number(params.maxPoolFromReturn))
      ? Math.max(0, Number(params.maxPoolFromReturn))
      : null;
  if (params.saleReturnId && cap != null && cap > remaining + 0.01) {
    await client
      .from("sale_returns")
      .update({ credit_available_balance: Math.round(remaining * 100) / 100 })
      .eq("id", params.saleReturnId)
      .eq("organization_id", params.organizationId);
  }

  // Heal-up: pending returns without a CN header may have NULL CAB — set to net_amount
  // (never above live CN remaining when a credit_notes row exists).
  if (params.saleReturnId && need > 0.01) {
    const { data: srRow } = await client
      .from("sale_returns")
      .select("net_amount, credit_available_balance, credit_status, credit_note_id")
      .eq("id", params.saleReturnId)
      .eq("organization_id", params.organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (srRow) {
      const cabRaw = srRow.credit_available_balance;
      const cabMissing =
        cabRaw == null || (typeof cabRaw === "number" && Number.isNaN(cabRaw));
      const isPending =
        String(srRow.credit_status || "").toLowerCase() === "pending";
      const noCn = !String(srRow.credit_note_id || "").trim();
      const netN = Math.max(0, Number(srRow.net_amount || 0));
      if (cabMissing && isPending && noCn && netN > 0.01) {
        const healed = Math.round(Math.min(netN, remaining > 0.01 ? remaining : netN) * 100) / 100;
        await client
          .from("sale_returns")
          .update({ credit_available_balance: healed })
          .eq("id", params.saleReturnId)
          .eq("organization_id", params.organizationId);
      }
    }
  }

  if (need > remaining + 0.01) {
    throw new Error("exceeds available credit note balance");
  }

  return remaining;
}

export function formatCnApplyError(err: unknown): string {
  const msg = String((err as { message?: string })?.message || err || "").toLowerCase();
  if (msg.includes("exceeds available credit note balance")) {
    return "Credit note balance in Accounts is lower than the amount shown. Refresh and try again — only the live CN balance can be applied.";
  }
  if (msg.includes("exceeds available advance balance")) {
    return "Advance balance in Accounts is lower than the amount shown. Refresh and try again.";
  }
  if (msg.includes("exceeds invoice balance")) {
    return "Amount exceeds invoice outstanding. Refresh the invoice list and try a smaller allocation.";
  }
  return String((err as { message?: string })?.message || err || "Adjustment failed");
}
