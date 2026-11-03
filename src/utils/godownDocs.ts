/**
 * Industrial mode, Phase 3 step 3d: send a document's goods out of a godown.
 *
 * Part 1 covers the Sale Invoice. The bill saves exactly as before (its stock comes off Main).
 * Before the save, godown_doc_check says what the picked godown does not have; right after it,
 * godown_sync_doc takes the goods from that godown (or only the difference on an edit).
 * Deleting, cancelling or restoring the bill is followed by a database trigger.
 */
import { supabase } from "@/integrations/supabase/client";
import { isMissingGodownSql } from "./godowns";

// The godown tables and functions (Phase 3 SQL) are not in the generated DB types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => supabase;

export type GodownDocType = "sale";

export type GodownDocShortLine = {
  variant_id: string;
  item: string;
  need: number;
  have: number;
  /** Stock of the item in other places (Main or other godowns). */
  elsewhere: number;
};

export type GodownDocSyncResult = {
  godown_id: string | null;
  godown_name: string | null;
  is_main: boolean;
  moved: number;
  moved_back: number;
  short: { item: string; godown: string | null; qty: number; way: "forward" | "back" }[];
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export function parseGodownDocShort(raw: unknown): GodownDocShortLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return {
      variant_id: String(x.variant_id ?? ""),
      item: String(x.item ?? "Item"),
      need: num(x.need),
      have: num(x.have),
      elsewhere: num(x.elsewhere),
    };
  });
}

export function parseGodownDocResult(raw: unknown): GodownDocSyncResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const short = Array.isArray(r.short) ? r.short : [];
  return {
    godown_id: r.godown_id ? String(r.godown_id) : null,
    godown_name: r.godown_name ? String(r.godown_name) : null,
    is_main: r.is_main !== false,
    moved: num(r.moved),
    moved_back: num(r.moved_back),
    short: short.map((s) => {
      const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return {
        item: String(x.item ?? "Item"),
        godown: x.godown ? String(x.godown) : null,
        qty: num(x.qty),
        way: x.way === "back" ? "back" : "forward",
      } as GodownDocSyncResult["short"][number];
    }),
  };
}

/** Sale lines summed per item, as the stock check wants them. */
export function godownDocCheckLines(lines: { variantId?: string | null; quantity?: number | null }[]) {
  const sum = new Map<string, number>();
  for (const l of lines) {
    const id = String(l.variantId ?? "").trim();
    const q = Number(l.quantity) || 0;
    if (!id || q <= 0) continue;
    sum.set(id, (sum.get(id) ?? 0) + q);
  }
  return [...sum.entries()].map(([variant_id, qty]) => ({ variant_id, qty: Math.round(qty * 1000) / 1000 }));
}

/** The message that stops a save when the picked place does not have the goods. */
export function godownDocShortMessage(short: GodownDocShortLine[], placeName: string): { title: string; description: string } | null {
  if (short.length === 0) return null;
  const lines = short.slice(0, 3).map((s) => {
    const where = s.elsewhere > 0 ? ` (${fmtQty(s.elsewhere)} in other godowns)` : "";
    return `${s.item}: need ${fmtQty(s.need)}, ${placeName} has ${fmtQty(s.have)}${where}`;
  });
  const more = short.length > 3 ? `; and ${short.length - 3} more` : "";
  return {
    title: `Not enough stock in ${placeName}`,
    description: `${lines.join("; ")}${more}. Pick another godown in "Dispatch from" or move the goods first.`,
  };
}

/** A warning after the save when some goods could not be taken from the godown. */
export function godownDocSyncWarning(r: GodownDocSyncResult): { title: string; description: string } | null {
  if (r.short.length === 0) return null;
  const lines = r.short.slice(0, 3).map((s) =>
    s.way === "forward"
      ? `${fmtQty(s.qty)} of ${s.item} was not in ${s.godown || "the godown"}, so it came off Main`
      : `${fmtQty(s.qty)} of ${s.item} could not go back to ${s.godown || "the godown"}`,
  );
  const more = r.short.length > 3 ? ` and ${r.short.length - 3} more` : "";
  return {
    title: "Bill saved. Some goods did not move",
    description: `${lines.join("; ")}${more}. Check Godown Transfers.`,
  };
}

/** The godown this document went out of (null = Main, or the step 3d SQL has not run). */
export async function fetchDocGodown(refType: GodownDocType, docId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("godown_doc_places")
    .select("godown_id")
    .eq("ref_type", refType)
    .eq("doc_id", docId)
    .maybeSingle();
  if (error) {
    if (isMissingGodownSql(error.message)) return null;
    throw error;
  }
  return data?.godown_id ? String(data.godown_id) : null;
}

export async function checkDocGodownStock(opts: {
  organizationId: string;
  refType: GodownDocType;
  docId: string | null;
  godownId: string;
  lines: { variant_id: string; qty: number }[];
}): Promise<GodownDocShortLine[]> {
  const { data, error } = await db().rpc("godown_doc_check", {
    p_organization_id: opts.organizationId,
    p_ref_type: opts.refType,
    p_doc_id: opts.docId,
    p_godown_id: opts.godownId,
    p_lines: opts.lines,
  });
  if (error) throw error;
  return parseGodownDocShort(data);
}

export async function syncDocGodown(refType: GodownDocType, docId: string, godownId: string): Promise<GodownDocSyncResult> {
  const { data, error } = await db().rpc("godown_sync_doc", { p_ref_type: refType, p_doc_id: docId, p_godown_id: godownId });
  if (error) throw error;
  return parseGodownDocResult(data);
}
