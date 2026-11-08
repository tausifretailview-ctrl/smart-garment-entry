/**
 * Industrial mode, Phase 3 step 3c: receive a purchase bill into a godown.
 *
 * The bill saves exactly as before (its stock lands on Main). Right after the save, Purchase
 * Entry calls godown_sync_purchase_bill, which moves the bill's quantities from Main into the
 * picked godown, or only the difference on an edit. Deleting, cancelling or restoring the bill
 * is followed by a database trigger, so nothing else has to call this.
 */
import { supabase } from "@/integrations/supabase/client";
import { isMissingGodownSql, sortGodowns, type Godown } from "./godowns";

// The godown tables and functions (Phase 3 SQL) are not in the generated DB types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => supabase;

export type PurchaseGodownShort = {
  item: string;
  godown: string | null;
  qty: number;
  /** in: Main did not have it to send; back: it already left the godown. */
  way: "in" | "back";
};

export type PurchaseGodownSyncResult = {
  godown_id: string | null;
  godown_name: string | null;
  is_main: boolean;
  moved_in: number;
  moved_back: number;
  short: PurchaseGodownShort[];
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function parsePurchaseGodownResult(raw: unknown): PurchaseGodownSyncResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const short = Array.isArray(r.short) ? r.short : [];
  return {
    godown_id: r.godown_id ? String(r.godown_id) : null,
    godown_name: r.godown_name ? String(r.godown_name) : null,
    is_main: r.is_main !== false,
    moved_in: num(r.moved_in),
    moved_back: num(r.moved_back),
    short: short.map((s) => {
      const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return {
        item: String(x.item ?? "Item"),
        godown: x.godown ? String(x.godown) : null,
        qty: num(x.qty),
        way: x.way === "in" ? "in" : "back",
      } as PurchaseGodownShort;
    }),
  };
}

/** Godowns a purchase bill can be received into: Main first, then open godowns, plus the bill's own. */
export function purchaseGodownChoices(godowns: Godown[], currentId?: string | null): Godown[] {
  return sortGodowns(godowns.filter((g) => g.godown_type === "main" || g.is_active || g.id === currentId));
}

/** The picker is worth showing when the shop has a godown besides Main (or the bill is in one). */
export function showPurchaseGodownPicker(godowns: Godown[], billGodownId?: string | null): boolean {
  const main = godowns.find((g) => g.godown_type === "main");
  if (!main) return false;
  if (billGodownId && billGodownId !== main.id) return true;
  return godowns.some((g) => g.godown_type !== "main" && g.is_active);
}

/**
 * Whether a save has to move goods: the bill goes into (or was in) a godown other than Main.
 * A bill that was and stays in Main needs nothing, which keeps plain saves as fast as before.
 */
export function purchaseGodownNeedsSync(opts: {
  mainId: string | null;
  targetId: string | null;
  savedId: string | null;
}): boolean {
  const { mainId } = opts;
  if (!mainId) return false;
  const target = opts.targetId || mainId;
  const saved = opts.savedId || mainId;
  return target !== mainId || saved !== mainId;
}

const fmtQty = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return r.toLocaleString("en-IN", { maximumFractionDigits: 3 });
};

/** What to tell the user after a sync, or null when nothing worth a message happened. */
export function purchaseGodownMessage(r: PurchaseGodownSyncResult): {
  title: string;
  description: string;
  warn: boolean;
} | null {
  const where = r.godown_name || "the godown";
  if (r.short.length > 0) {
    const lines = r.short.slice(0, 3).map((s) =>
      s.way === "back"
        ? `${fmtQty(s.qty)} of ${s.item} had already left ${s.godown || "the godown"}`
        : `${fmtQty(s.qty)} of ${s.item} was not in Main to send to ${s.godown || where}`,
    );
    const more = r.short.length > 3 ? ` and ${r.short.length - 3} more` : "";
    return {
      title: "Bill saved. Some goods were not moved",
      description: `${lines.join("; ")}${more}. Check Godown Transfers.`,
      warn: true,
    };
  }
  if (r.moved_in <= 0 && r.moved_back <= 0) return null;
  if (r.is_main) {
    return { title: "Goods back in Main", description: `${fmtQty(r.moved_back)} moved back to Main.`, warn: false };
  }
  const parts: string[] = [];
  if (r.moved_in > 0) parts.push(`${fmtQty(r.moved_in)} received into ${where}`);
  if (r.moved_back > 0) parts.push(`${fmtQty(r.moved_back)} moved back to Main`);
  return { title: `Received into ${where}`, description: `${parts.join(", ")}.`, warn: false };
}

/** The godown this bill was received into (null = Main, or the step 3c SQL has not run). */
export async function fetchPurchaseBillGodown(billId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("godown_purchase_bills")
    .select("godown_id")
    .eq("bill_id", billId)
    .maybeSingle();
  if (error) {
    if (isMissingGodownSql(error.message)) return null;
    throw error;
  }
  return data?.godown_id ? String(data.godown_id) : null;
}

export async function syncPurchaseBillGodown(billId: string, godownId: string): Promise<PurchaseGodownSyncResult> {
  const { data, error } = await db().rpc("godown_sync_purchase_bill", { p_bill_id: billId, p_godown_id: godownId });
  if (error) throw error;
  return parsePurchaseGodownResult(data);
}
