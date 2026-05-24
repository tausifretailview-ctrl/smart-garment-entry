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
 * If sale_return still shows a higher pool, align the CN header once (safe when used is low).
 */
export async function ensureCreditNoteHeadroom(
  client: SupabaseClient,
  params: {
    organizationId: string;
    creditNoteId: string;
    amountNeeded: number;
    maxPoolFromReturn?: number | null;
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
  let remaining = Math.max(0, credit - used);
  if (remaining >= need - 0.01) return remaining;

  const cap =
    params.maxPoolFromReturn != null && !Number.isNaN(Number(params.maxPoolFromReturn))
      ? Math.max(0, Number(params.maxPoolFromReturn))
      : null;
  const targetCredit = cap != null ? Math.min(used + cap, used + need) : used + need;
  const newCredit = Math.max(credit, targetCredit);

  if (newCredit <= credit + 0.01) {
    return remaining;
  }

  const { error: updErr } = await client
    .from("credit_notes")
    .update({
      credit_amount: Math.round(newCredit * 100) / 100,
      status:
        newCredit - used <= 0.01
          ? "fully_used"
          : used > 0.01
            ? "partially_used"
            : "active",
    })
    .eq("id", params.creditNoteId);
  if (updErr) throw updErr;

  remaining = Math.max(0, newCredit - used);
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
