import { appPrint, isElectron } from "@/utils/appPrint";
import { printHtmlInFrame } from "@/utils/printHtmlFrame";
import type { Godown } from "@/utils/godowns";
import { CHALLAN_COPIES, buildGodownChallanHtml, fetchGodownMove, fetchGodownMoveItems } from "@/utils/godownTransfer";

export type ChallanShop = { name: string; address: string; gstin: string; phone: string };

/** Shop details for the challan header, from the settings row. */
export function challanShopOf(settings: unknown, fallbackName: string): ChallanShop {
  const s = (settings ?? {}) as { business_name?: string | null; address?: string | null; gst_number?: string | null; mobile_number?: string | null };
  return {
    name: String(s.business_name || fallbackName || "").trim(),
    address: String(s.address ?? "").trim(),
    gstin: String(s.gst_number ?? "").trim().toUpperCase(),
    phone: String(s.mobile_number ?? "").trim(),
  };
}

/** Print the delivery challan of one godown transfer. Throws with a readable message. */
export async function printGodownTransferChallan(opts: {
  moveId: string;
  godowns: Godown[];
  shop: ChallanShop;
  allCopies?: boolean;
}): Promise<void> {
  const [move, items] = await Promise.all([fetchGodownMove(opts.moveId), fetchGodownMoveItems(opts.moveId)]);
  const from = opts.godowns.find((g) => g.id === move.from_godown_id);
  const to = opts.godowns.find((g) => g.id === move.to_godown_id);
  if (!from || !to) throw new Error("Could not find the godowns of this transfer. Refresh and try again.");
  const html = buildGodownChallanHtml({
    shop: opts.shop,
    move,
    from,
    to,
    items,
    copies: opts.allCopies ? [...CHALLAN_COPIES] : [CHALLAN_COPIES[0]],
  });
  if (!isElectron()) {
    // Web: print in place like the bills do, without opening a new window.
    await printHtmlInFrame(html);
    return;
  }
  const res = await appPrint({ type: "report", html, silent: false });
  if (!res.success && res.error) throw new Error(res.error);
}
