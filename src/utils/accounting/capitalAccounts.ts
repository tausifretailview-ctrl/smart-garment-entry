import type { SeededAccount } from "@/utils/accounting/seedDefaultAccounts";
import { OWNER_DRAWINGS_ACCOUNT } from "@/utils/accounting/dayCloseJournal";
import type { ThirdPartyVoucherDirection } from "@/utils/accounting/thirdPartyVoucherCash";

/**
 * Owner capital / business investment (Accounts → Capital & Investment).
 *
 * Money the owner or a partner puts into the business, or takes back out, posted against
 * that person's Capital ledger (Equity, Tally group "Capital Account"):
 *   investment  = Dr Cash/Bank, Cr Capital
 *   withdrawal  = Dr Capital,   Cr Cash/Bank
 * Stored like a third-party voucher (voucher_entries.reference_type "third_party",
 * reference_id = capital ledger; journal "ThirdPartyVoucher"), so the cash tallies,
 * Day Book, restore/backfill and the GL reports already handle it.
 */

export const CAPITAL_ACCOUNT_GROUP = "Capital Account" as const;

/** First capital ledger the screen creates when the shop has none. */
export const DEFAULT_CAPITAL_ACCOUNT = { code: "3000", name: "Owner's Capital" } as const;

/** Codes 3000–3099 are kept for capital ledgers (3100 is the day-close Owner's Drawings). */
export const CAPITAL_CODE_MIN = 3000;
export const CAPITAL_CODE_MAX = 3099;

export type CapitalDirection = "investment" | "withdrawal";

/** Capital ledgers a person can invest into: Equity, group Capital Account, not Owner's Drawings. */
export function isCapitalLedger(
  account: Pick<SeededAccount, "account_type" | "account_group" | "account_code">,
): boolean {
  return (
    account.account_type === "Equity" &&
    account.account_group === CAPITAL_ACCOUNT_GROUP &&
    account.account_code !== OWNER_DRAWINGS_ACCOUNT.code
  );
}

export function filterCapitalLedgers<T extends Pick<SeededAccount, "account_type" | "account_group" | "account_code">>(
  accounts: T[],
): T[] {
  return accounts.filter(isCapitalLedger).sort((a, b) => a.account_code.localeCompare(b.account_code));
}

/** Next free code in 3000–3099 (UNIQUE organization_id + account_code). */
export function nextCapitalAccountCode(usedCodes: Iterable<string>): string {
  const used = new Set(Array.from(usedCodes, (c) => String(c).trim()));
  for (let n = CAPITAL_CODE_MIN; n <= CAPITAL_CODE_MAX; n++) {
    const code = String(n);
    if (!used.has(code)) return code;
  }
  throw new Error("No free capital account codes left (3000–3099)");
}

export function capitalToThirdPartyDirection(direction: CapitalDirection): ThirdPartyVoucherDirection {
  return direction === "investment" ? "received" : "paid_out";
}

export function capitalDirectionFromVoucherType(voucherType: string | null | undefined): CapitalDirection {
  return String(voucherType || "").toLowerCase() === "receipt" ? "investment" : "withdrawal";
}

export function defaultCapitalNarration(direction: CapitalDirection): string {
  return direction === "investment" ? "Capital introduced" : "Capital withdrawn";
}

export interface CapitalVoucherRow {
  id: string;
  voucher_type: string;
  total_amount: number | string | null;
  reference_id: string | null;
}

export interface CapitalSummaryRow {
  accountId: string;
  name: string;
  code: string;
  invested: number;
  withdrawn: number;
  /** Invested − withdrawn through this screen (opening capital is in the ledger, not here). */
  net: number;
  entries: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 || 0;

/** Totals per capital ledger from its vouchers (vouchers of other ledgers are ignored). */
export function summarizeCapital(
  ledgers: Array<Pick<SeededAccount, "id" | "account_name" | "account_code">>,
  vouchers: CapitalVoucherRow[],
): { rows: CapitalSummaryRow[]; invested: number; withdrawn: number; net: number } {
  const rows = new Map<string, CapitalSummaryRow>(
    ledgers.map((l) => [
      l.id,
      { accountId: l.id, name: l.account_name, code: l.account_code, invested: 0, withdrawn: 0, net: 0, entries: 0 },
    ]),
  );
  for (const v of vouchers) {
    const row = v.reference_id ? rows.get(v.reference_id) : undefined;
    if (!row) continue;
    const amount = Number(v.total_amount) || 0;
    if (capitalDirectionFromVoucherType(v.voucher_type) === "investment") row.invested += amount;
    else row.withdrawn += amount;
    row.entries += 1;
  }
  let invested = 0;
  let withdrawn = 0;
  const list = [...rows.values()].map((r) => {
    invested += r.invested;
    withdrawn += r.withdrawn;
    return { ...r, invested: round2(r.invested), withdrawn: round2(r.withdrawn), net: round2(r.invested - r.withdrawn) };
  });
  return { rows: list, invested: round2(invested), withdrawn: round2(withdrawn), net: round2(invested - withdrawn) };
}

/** Voucher description: "Capital Invested: Owner's Capital — Capital introduced". */
export function buildCapitalVoucherDescription(direction: CapitalDirection, ownerName: string, narration: string): string {
  const label = direction === "investment" ? "Capital Invested" : "Capital Withdrawn";
  return `${label}: ${ownerName} — ${narration.trim() || defaultCapitalNarration(direction)}`.slice(0, 500);
}

/** Inverse of buildCapitalVoucherDescription (anything else comes back unchanged). */
export function parseCapitalNarration(description: string | null | undefined): string {
  const raw = String(description || "").trim();
  const match = raw.match(/^Capital (?:Invested|Withdrawn):\s*.+? — ([\s\S]+)$/);
  return match?.[1]?.trim() || raw;
}
