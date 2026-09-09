import {
  THIRD_PARTY_JOURNAL_REFERENCE_TYPE,
  THIRD_PARTY_VOUCHER_REFERENCE_TYPE,
  type ThirdPartyVoucherDirection,
} from "@/utils/accounting/thirdPartyVoucherCash";

export type ThirdPartyHistoryVoucher = {
  id: string;
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  total_amount: number;
  payment_method: string | null;
  description: string | null;
  reference_id: string | null;
};

export function directionFromVoucherType(
  voucherType: string | null | undefined,
): ThirdPartyVoucherDirection {
  return String(voucherType || "").toLowerCase() === "receipt" ? "received" : "paid_out";
}

export function buildThirdPartyVoucherDescription(
  direction: ThirdPartyVoucherDirection,
  partyName: string,
  narration: string,
): string {
  const dirLabel = direction === "paid_out" ? "Paid" : "Received";
  return `Third-party ${dirLabel}: ${partyName} — ${narration.trim()}`.slice(0, 500);
}

/**
 * Inverse of `buildThirdPartyVoucherDescription`.
 * Post template: `Third-party ${Paid|Received}: ${partyName} — ${narration}`
 */
export function parseThirdPartyNarration(description: string | null | undefined): string {
  const raw = String(description || "").trim();
  if (!raw) return "";
  const match = raw.match(/^Third-party (?:Paid|Received):\s*.+? — ([\s\S]+)$/);
  if (match?.[1]) return match[1].trim();
  return raw;
}

export function inferCashBankAccountIdFromJournalLines(
  lines: Array<{ account_id: string }>,
  partyAccountId: string,
): string | null {
  const other = lines.find((l) => l.account_id && l.account_id !== partyAccountId);
  return other?.account_id ?? null;
}

export function formatThirdPartyPaymentMethod(method: string | null | undefined): string {
  const m = String(method || "").toLowerCase();
  if (m === "bank_transfer" || m === "bank") return "Bank";
  if (m === "upi") return "UPI";
  if (m === "cash" || !m) return "Cash";
  return String(method);
}

export async function loadThirdPartyVoucherHistory(
  organizationId: string,
  client: {
    from: (table: string) => any;
  },
): Promise<ThirdPartyHistoryVoucher[]> {
  const allRows: ThirdPartyHistoryVoucher[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await client
      .from("voucher_entries")
      .select(
        "id, voucher_number, voucher_date, voucher_type, total_amount, payment_method, description, reference_id, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("reference_type", THIRD_PARTY_VOUCHER_REFERENCE_TYPE)
      .is("deleted_at", null)
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as ThirdPartyHistoryVoucher[];
    allRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

/** Cash/bank is the journal line that is not the party ledger. */
export async function loadThirdPartyJournalCashBankAccountId(
  organizationId: string,
  voucherId: string,
  partyAccountId: string,
  client: {
    from: (table: string) => any;
  },
): Promise<string | null> {
  const { data: je, error: jeErr } = await client
    .from("journal_entries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("reference_type", THIRD_PARTY_JOURNAL_REFERENCE_TYPE)
    .eq("reference_id", voucherId)
    .maybeSingle();
  if (jeErr) throw jeErr;
  if (!je?.id) return null;
  const { data: lines, error: lineErr } = await client
    .from("journal_lines")
    .select("account_id")
    .eq("journal_entry_id", je.id);
  if (lineErr) throw lineErr;
  return inferCashBankAccountIdFromJournalLines(lines || [], partyAccountId);
}
