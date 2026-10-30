/**
 * Daily Account Tally (day close) helpers.
 *
 * The day close is stored in `daily_tally_snapshot` (one row per org + date):
 *   counted cash = handover to owner + deposit to bank + closing cash in drawer
 * and the closing cash (`leave_in_drawer`) is the next day's opening cash.
 *
 * Extra details (card / UPI check, short reason, who closed) live inside the
 * `denomination_data` jsonb under `accountTally`, so no new column is needed.
 * The note counts are also written under the older keys (`counts`/`coins` used by
 * Daily Tally, `denomCounts`/`coinsBulk` used by the POS Cash Tally pop-up).
 */

export const ACCOUNT_TALLY_NOTES = [500, 200, 100, 50, 20, 10, 2000] as const;

export type DenominationCounts = Record<number, number>;

export const emptyDenominationCounts = (): DenominationCounts =>
  Object.fromEntries(ACCOUNT_TALLY_NOTES.map((n) => [n, 0])) as DenominationCounts;

export type AccountTallyMeta = {
  version: 1;
  cashSale: number;
  cardSale: number;
  upiSale: number;
  bankSale: number;
  creditSale: number;
  totalSale: number;
  cashIn: number;
  cashOut: number;
  expectedCard: number;
  expectedUpi: number;
  actualCard: number | null;
  actualUpi: number | null;
  shortReason: string;
  handoverTo: string;
  closedBy: string;
  closedAt: string;
};

export type ParsedAccountTallyData = {
  counts: DenominationCounts;
  coins: number;
  meta: AccountTallyMeta | null;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function denominationTotal(counts: DenominationCounts, coins: number): number {
  let total = 0;
  for (const note of ACCOUNT_TALLY_NOTES) total += note * Math.max(0, num(counts[note]));
  return round2(total + Math.max(0, num(coins)));
}

export function denominationPieces(counts: DenominationCounts): number {
  return ACCOUNT_TALLY_NOTES.reduce((sum, note) => sum + Math.max(0, num(counts[note])), 0);
}

/** Reads any of the saved shapes (Daily Tally string/object, POS pop-up object, Account Tally). */
export function parseAccountTallyData(raw: unknown): ParsedAccountTallyData {
  let data: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  } else if (raw && typeof raw === "object") {
    data = raw as Record<string, unknown>;
  }

  const counts = emptyDenominationCounts();
  const savedCounts = (data?.counts ?? data?.denomCounts) as Record<string, unknown> | undefined;
  if (savedCounts && typeof savedCounts === "object") {
    for (const note of ACCOUNT_TALLY_NOTES) counts[note] = Math.max(0, num(savedCounts[note]));
  }
  const coins = Math.max(0, num(data?.coins ?? data?.coinsBulk));
  const metaRaw = data?.accountTally as Partial<AccountTallyMeta> | undefined;
  const meta = metaRaw && typeof metaRaw === "object" ? ({ ...metaRaw, version: 1 } as AccountTallyMeta) : null;
  return { counts, coins, meta };
}

export function buildAccountTallyData(
  counts: DenominationCounts,
  coins: number,
  meta: AccountTallyMeta,
) {
  const total = denominationTotal(counts, coins);
  return {
    counts,
    coins,
    total,
    denomCounts: counts,
    coinsBulk: coins,
    accountTally: meta,
  };
}

/** Closing cash left in the drawer after paying the owner and the bank. */
export function computeClosingCash(counted: number, handover: number, deposit: number): number {
  return round2(num(counted) - num(handover) - num(deposit));
}

export type TallyDifferenceStatus = "balanced" | "short" | "excess";

export function tallyDifferenceStatus(difference: number): TallyDifferenceStatus {
  const d = round2(difference);
  if (Math.abs(d) < 1) return "balanced";
  return d < 0 ? "short" : "excess";
}

/** Opening for a day = closing (`leave_in_drawer`) of the last closed day before it. */
export function openingFromPreviousClose(
  previous: { leave_in_drawer?: number | null } | null | undefined,
): number {
  return round2(num(previous?.leave_in_drawer));
}
