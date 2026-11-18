import { dcOnlyShare, fetchDcLineShares, nonDcShare } from "@/utils/dcSaleShare";
import type { DcViewFlags } from "@/utils/dcView";

type ReceiptLike = {
  reference_type?: string | null;
  reference_id?: string | null;
  total_amount?: number | string | null;
  discount_amount?: number | string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Receipts (payments on old bills) for this screen's DC view, the same way the bills themselves
 * are shown (dcSaleShare.ts):
 * - DC hidden: a receipt against an all-DC bill is left out; against a mixed bill only its
 *   non-DC part counts. Receipts not tied to a bill (on account) stay.
 * - DC User: only receipts against bills with a DC line, at their DC part; receipts not tied
 *   to a bill are left out.
 * - Neither: unchanged.
 */
export async function receiptsForDcView<T extends ReceiptLike>(
  client: unknown,
  receipts: readonly T[],
  view: DcViewFlags,
): Promise<T[]> {
  if (!view.hideDc && !view.onlyDc) return receipts as T[];
  if (receipts.length === 0) return [];
  const saleIds = receipts
    .filter((r) => r.reference_type === "sale" && r.reference_id)
    .map((r) => String(r.reference_id));
  const shares = saleIds.length > 0 ? await fetchDcLineShares(client, saleIds) : new Map();

  const out: T[] = [];
  for (const receipt of receipts) {
    const onBill = receipt.reference_type === "sale" && !!receipt.reference_id;
    if (!onBill) {
      if (!view.onlyDc) out.push(receipt);
      continue;
    }
    const share = shares.get(String(receipt.reference_id));
    const part = view.onlyDc ? dcOnlyShare(share) : nonDcShare(share);
    if (part <= 0) continue;
    if (part >= 1) {
      out.push(receipt);
      continue;
    }
    out.push({
      ...receipt,
      total_amount: round2((Number(receipt.total_amount) || 0) * part),
      discount_amount: round2((Number(receipt.discount_amount) || 0) * part),
    });
  }
  return out;
}
