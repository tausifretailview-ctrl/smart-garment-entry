import type { SeededAccount } from "@/utils/accounting/seedDefaultAccounts";
import type { GstBreakdown } from "@/utils/accounting/gstBreakdown";
import type { PostJournalLineInput } from "@/utils/accounting/accountingTypes";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export type PartyLineContext = {
  partyType?: "customer" | "supplier";
  partyId?: string | null;
  partyNameSnapshot?: string | null;
};

export function lineKey(line: PostJournalLineInput): string {
  return `${line.accountId}|${line.partyType ?? ""}|${line.partyId ?? ""}`;
}

/** Combine duplicate account/party lines before posting. */
export function mergeJournalLines(lines: PostJournalLineInput[]): PostJournalLineInput[] {
  const map = new Map<string, PostJournalLineInput>();
  for (const line of lines) {
    const key = lineKey(line);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...line });
      continue;
    }
    existing.debitAmount = round2(existing.debitAmount + line.debitAmount);
    existing.creditAmount = round2(existing.creditAmount + line.creditAmount);
  }
  return [...map.values()].filter((l) => l.debitAmount > 0 || l.creditAmount > 0);
}

export function pushLine(
  lines: PostJournalLineInput[],
  accountId: string,
  debitAmount: number,
  creditAmount: number,
  party?: PartyLineContext
): void {
  const dr = round2(debitAmount);
  const cr = round2(creditAmount);
  if (dr <= 0 && cr <= 0) return;
  lines.push({
    accountId,
    debitAmount: dr,
    creditAmount: cr,
    partyType: party?.partyType,
    partyId: party?.partyId ?? undefined,
    partyNameSnapshot: party?.partyNameSnapshot ?? undefined,
  });
}

const getByCode = (accounts: SeededAccount[], code: string) =>
  accounts.find((a) => a.account_code === code);

/** Credit output GST ledgers (2200/2210/2220). */
export function appendOutputGstCredits(
  lines: PostJournalLineInput[],
  accounts: SeededAccount[],
  gst: GstBreakdown,
  party?: PartyLineContext
): void {
  const cgst = getByCode(accounts, "2200");
  const sgst = getByCode(accounts, "2210");
  const igst = getByCode(accounts, "2220");
  if (gst.cgst > 0 && cgst) pushLine(lines, cgst.id, 0, gst.cgst, party);
  if (gst.sgst > 0 && sgst) pushLine(lines, sgst.id, 0, gst.sgst, party);
  if (gst.igst > 0 && igst) pushLine(lines, igst.id, 0, gst.igst, party);
}

/** Debit input GST ledgers (1400/1410/1420). */
export function appendInputGstDebits(
  lines: PostJournalLineInput[],
  accounts: SeededAccount[],
  gst: GstBreakdown,
  party?: PartyLineContext
): void {
  const cgst = getByCode(accounts, "1400");
  const sgst = getByCode(accounts, "1410");
  const igst = getByCode(accounts, "1420");
  if (gst.cgst > 0 && cgst) pushLine(lines, cgst.id, gst.cgst, 0, party);
  if (gst.sgst > 0 && sgst) pushLine(lines, sgst.id, gst.sgst, 0, party);
  if (gst.igst > 0 && igst) pushLine(lines, igst.id, gst.igst, 0, party);
}

/** Reverse output GST (sale return): debit output tax ledgers. */
export function appendOutputGstDebits(
  lines: PostJournalLineInput[],
  accounts: SeededAccount[],
  gst: GstBreakdown,
  party?: PartyLineContext
): void {
  const cgst = getByCode(accounts, "2200");
  const sgst = getByCode(accounts, "2210");
  const igst = getByCode(accounts, "2220");
  if (gst.cgst > 0 && cgst) pushLine(lines, cgst.id, gst.cgst, 0, party);
  if (gst.sgst > 0 && sgst) pushLine(lines, sgst.id, gst.sgst, 0, party);
  if (gst.igst > 0 && igst) pushLine(lines, igst.id, gst.igst, 0, party);
}

/** Reverse input GST (purchase return): credit input tax ledgers. */
export function appendInputGstCredits(
  lines: PostJournalLineInput[],
  accounts: SeededAccount[],
  gst: GstBreakdown,
  party?: PartyLineContext
): void {
  const cgst = getByCode(accounts, "1400");
  const sgst = getByCode(accounts, "1410");
  const igst = getByCode(accounts, "1420");
  if (gst.cgst > 0 && cgst) pushLine(lines, cgst.id, 0, gst.cgst, party);
  if (gst.sgst > 0 && sgst) pushLine(lines, sgst.id, 0, gst.sgst, party);
  if (gst.igst > 0 && igst) pushLine(lines, igst.id, 0, gst.igst, party);
}

/** Post round-off balancing line to 6900 (positive round-off → credit expense account). */
export function appendRoundOffBalancingLine(
  lines: PostJournalLineInput[],
  accounts: SeededAccount[],
  amount: number
): void {
  const abs = round2(Math.abs(amount));
  if (abs < 0.01) return;
  const roundOff = getByCode(accounts, "6900");
  if (!roundOff) return;
  if (amount > 0) {
    pushLine(lines, roundOff.id, 0, abs);
  } else {
    pushLine(lines, roundOff.id, abs, 0);
  }
}

/** Add a 6900 line so total debits equal total credits. */
export function balanceJournalWithRoundOff(lines: PostJournalLineInput[], accounts: SeededAccount[]): void {
  const dr = round2(lines.reduce((s, l) => s + l.debitAmount, 0));
  const cr = round2(lines.reduce((s, l) => s + l.creditAmount, 0));
  const diff = round2(dr - cr);
  if (Math.abs(diff) >= 0.01) {
    appendRoundOffBalancingLine(lines, accounts, -diff);
  }
}
