/** Matches RPC `_get_customer_party_balances_rows` settled threshold. */
export const PARTY_BALANCE_SETTLED_THRESHOLD = 0.5;

/** A4-style rows per screen page — no in-table scroll; use Previous/Next. */
export const CUSTOMER_PARTY_BALANCES_PAGE_SIZE = 30;

export type PartyBalanceDisplayInput = {
  direction?: string | null;
  signed_balance?: number | null;
};

/**
 * Dr/Cr label for display — prefers RPC `direction`; sign-based fallback only when RPC omits it.
 * RPC rule: signed_balance > 0.5 → Dr, < -0.5 → Cr, else Settled (same thresholds).
 */
export function partyBalanceDirection(row: PartyBalanceDisplayInput): "Dr" | "Cr" | "Settled" {
  const rpcDirection = (row.direction ?? "").trim();
  if (rpcDirection === "Dr" || rpcDirection === "Cr" || rpcDirection === "Settled") {
    return rpcDirection;
  }

  const signed = Number(row.signed_balance ?? 0);
  if (signed > PARTY_BALANCE_SETTLED_THRESHOLD) return "Dr";
  if (signed < -PARTY_BALANCE_SETTLED_THRESHOLD) return "Cr";
  return "Settled";
}

/** Display amount is always |signed_balance| with the direction label beside it. */
export function partyBalanceDisplayAmount(signedBalance: number | null | undefined): number {
  return Math.abs(Number(signedBalance ?? 0));
}

export function normalizePartySearchPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type PartySearchRow = {
  customer_name?: string | null;
  phone?: string | null;
};

/** Filter full party list by name OR phone (digits-normalized for phone). */
export function matchesPartyBalanceSearch(row: PartySearchRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if ((row.customer_name || "").toLowerCase().includes(q)) return true;

  const phone = row.phone || "";
  if (phone.toLowerCase().includes(q)) return true;

  const qDigits = normalizePartySearchPhone(q);
  if (qDigits) {
    const phoneDigits = normalizePartySearchPhone(phone);
    if (phoneDigits.includes(qDigits)) return true;
  }

  return false;
}

export function isPartyBalanceSettled(signedBalance: number | null | undefined): boolean {
  return Math.abs(Number(signedBalance ?? 0)) < PARTY_BALANCE_SETTLED_THRESHOLD;
}

export function slicePartyBalancePage<T>(rows: T[], page: number, pageSize: number = CUSTOMER_PARTY_BALANCES_PAGE_SIZE): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function partyBalanceTotalPages(rowCount: number, pageSize: number = CUSTOMER_PARTY_BALANCES_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

export function clampPartyBalancePage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
