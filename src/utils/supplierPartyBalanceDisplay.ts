/** Matches RPC settled threshold (same as customer party list). */
export const PARTY_BALANCE_SETTLED_THRESHOLD = 0.5;

/** Client-side pagination — 50–60 rows per screen page. */
export const SUPPLIER_PARTY_BALANCES_PAGE_SIZE = 55;

export type SupplierPartyBalanceDisplayInput = {
  direction?: string | null;
  signed_balance?: number | null;
};

/**
 * Supplier Dr/Cr — positive balance = Cr (payable); negative = Dr (advance/overpaid).
 * Prefers RPC `direction` when present.
 */
export function supplierPartyBalanceDirection(
  row: SupplierPartyBalanceDisplayInput,
): "Dr" | "Cr" | "Settled" {
  const rpcDirection = (row.direction ?? "").trim();
  if (rpcDirection === "Dr" || rpcDirection === "Cr" || rpcDirection === "Settled") {
    return rpcDirection;
  }

  const signed = Number(row.signed_balance ?? 0);
  if (signed > PARTY_BALANCE_SETTLED_THRESHOLD) return "Cr";
  if (signed < -PARTY_BALANCE_SETTLED_THRESHOLD) return "Dr";
  return "Settled";
}

export function supplierPartyBalanceDisplayAmount(signedBalance: number | null | undefined): number {
  return Math.abs(Number(signedBalance ?? 0));
}

export function normalizePartySearchPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type SupplierPartySearchRow = {
  supplier_name?: string | null;
  phone?: string | null;
};

export function matchesSupplierPartyBalanceSearch(row: SupplierPartySearchRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if ((row.supplier_name || "").toLowerCase().includes(q)) return true;

  const phone = row.phone || "";
  if (phone.toLowerCase().includes(q)) return true;

  const qDigits = normalizePartySearchPhone(q);
  if (qDigits) {
    const phoneDigits = normalizePartySearchPhone(phone);
    if (phoneDigits.includes(qDigits)) return true;
  }

  return false;
}

export type SupplierPartyDirectionFilter = "all" | "Dr" | "Cr";

export function matchesSupplierPartyDirectionFilter(
  row: SupplierPartyBalanceDisplayInput,
  filter: SupplierPartyDirectionFilter,
): boolean {
  if (filter === "all") return true;
  return supplierPartyBalanceDirection(row) === filter;
}

export function isSupplierPartyBalanceSettled(signedBalance: number | null | undefined): boolean {
  return Math.abs(Number(signedBalance ?? 0)) < PARTY_BALANCE_SETTLED_THRESHOLD;
}

export function sliceSupplierPartyBalancePage<T>(
  rows: T[],
  page: number,
  pageSize: number = SUPPLIER_PARTY_BALANCES_PAGE_SIZE,
): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function supplierPartyBalanceTotalPages(
  rowCount: number,
  pageSize: number = SUPPLIER_PARTY_BALANCES_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

export function clampSupplierPartyBalancePage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
