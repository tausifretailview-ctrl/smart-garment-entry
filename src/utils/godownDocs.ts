/**
 * Industrial mode, Phase 3 step 3d: send a document's goods out of a godown.
 *
 * Part 1 covers the Sale Invoice. The bill saves exactly as before (its stock comes off Main).
 * Before the save, godown_doc_check says what the picked godown does not have; right after it,
 * godown_sync_doc takes the goods from that godown (or only the difference on an edit).
 * Deleting, cancelling or restoring the bill is followed by a database trigger.
 *
 * Part 2 covers the Delivery Challan. A challan moves no stock, so it only keeps the godown it
 * was sent from; the invoice made from it later goes out of that godown.
 *
 * Part 3 covers the Sale Return, the other way round: the return saves as before (its goods
 * come back on Main), then godown_sync_doc moves them into the picked godown. No check before
 * the save is needed, because nothing has to be there already.
 *
 * Part 4 covers the Purchase Return, which sends goods out like a sale: checked before the save,
 * then taken from the picked godown ("Return from").
 */
import { supabase } from "@/integrations/supabase/client";
import { godownErrorText, isMissingGodownSql } from "./godowns";

// The godown tables and functions (Phase 3 SQL) are not in the generated DB types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => supabase;

export type GodownDocType = "sale" | "challan" | "sale_return" | "purchase_return";

/** The Phase 3 SQL step each document needs. */
export const GODOWN_DOC_SQL_STEP: Record<GodownDocType, string> = {
  sale: "3d-1",
  challan: "3d-2",
  sale_return: "3d-3",
  purchase_return: "3d-4",
};

/** The name of the godown pick on each document's screen. */
export const GODOWN_DOC_PICK_LABEL: Record<GodownDocType, string> = {
  sale: "Dispatch from",
  challan: "Dispatch from",
  sale_return: "Return into",
  purchase_return: "Return from",
};

/**
 * What to tell the user when the godown could not be set after the document was saved.
 * Before its own SQL step runs, the database does not know the document type yet and says
 * "Document not found" (or "do not follow ... yet"): that also means the SQL step is missing.
 */
export function docGodownSyncFailMessage(refType: GodownDocType, text: string) {
  const step = GODOWN_DOC_SQL_STEP[refType];
  const reason = text.replace(/\.$/, "");
  const missingSql =
    isMissingGodownSql(text) || (refType !== "sale" && /document not found|do not follow .* yet/i.test(text));
  if (refType === "challan") {
    return {
      title: "Challan saved without its godown",
      description: missingSql
        ? `Run the Phase 3 step ${step} SQL first. The invoice made from this challan will go out of Main.`
        : `${reason}. The invoice made from this challan will go out of Main.`,
    };
  }
  if (refType === "purchase_return") {
    return {
      title: "Return saved. Goods went out of Main",
      description: missingSql
        ? `Run the Phase 3 step ${step} SQL first, then open this return and save it again.`
        : `${reason}. Open the return and save again, or move the stock in Godown Transfers.`,
    };
  }
  if (refType === "sale_return") {
    return {
      title: "Return saved. Goods stayed in Main",
      description: missingSql
        ? `Run the Phase 3 step ${step} SQL first, then open this return and save it again.`
        : `${reason}. Open the return and save again, or move the stock in Godown Transfers.`,
    };
  }
  return {
    title: "Bill saved. Goods went out of Main",
    description: missingSql
      ? `Run the Phase 3 step ${step} SQL first, then open this bill and save it again.`
      : `${reason}. Open the bill and save again, or move the stock in Godown Transfers.`,
  };
}

/** Whether saving the document takes stock (a delivery challan does not; a sale return adds it). */
export function godownDocTakesStock(refType: GodownDocType): boolean {
  return refType === "sale" || refType === "purchase_return";
}

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
export function godownDocShortMessage(
  short: GodownDocShortLine[],
  placeName: string,
  pickLabel = "Dispatch from",
): { title: string; description: string } | null {
  if (short.length === 0) return null;
  const lines = short.slice(0, 3).map((s) => {
    const where = s.elsewhere > 0 ? ` (${fmtQty(s.elsewhere)} in other godowns)` : "";
    return `${s.item}: need ${fmtQty(s.need)}, ${placeName} has ${fmtQty(s.have)}${where}`;
  });
  const more = short.length > 3 ? `; and ${short.length - 3} more` : "";
  return {
    title: `Not enough stock in ${placeName}`,
    description: `${lines.join("; ")}${more}. Pick another godown in "${pickLabel}" or move the goods first.`,
  };
}

/** A warning after the save when some goods could not be moved to or from the godown. */
export function godownDocSyncWarning(
  r: GodownDocSyncResult,
  refType: GodownDocType = "sale",
): { title: string; description: string } | null {
  if (r.short.length === 0) return null;
  const goodsIn = refType === "sale_return";
  const lines = r.short.slice(0, 3).map((s) => {
    const qty = fmtQty(s.qty);
    const place = s.godown || "the godown";
    if (goodsIn) {
      return s.way === "forward"
        ? `${qty} of ${s.item} could not go into ${place}, so it stayed in Main`
        : `${qty} of ${s.item} was no longer in ${place}, so it could not come out`;
    }
    return s.way === "forward"
      ? `${qty} of ${s.item} was not in ${place}, so it came off Main`
      : `${qty} of ${s.item} could not go back to ${place}`;
  });
  const more = r.short.length > 3 ? ` and ${r.short.length - 3} more` : "";
  return {
    title: refType === "sale" || refType === "challan" ? "Bill saved. Some goods did not move" : "Return saved. Some goods did not move",
    description: `${lines.join("; ")}${more}. Check Godown Transfers.`,
  };
}

/** The godown this document went out of, or came into (null = Main, or the step 3d SQL has not run). */
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

/** Godown names of the given documents that went out of a godown other than Main, by document id. */
export async function fetchDocGodownNames(refType: GodownDocType, docIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unique = Array.from(new Set(docIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db()
      .from("godown_doc_places")
      .select("doc_id, godowns(name)")
      .eq("ref_type", refType)
      .in("doc_id", unique.slice(i, i + 200));
    if (error) {
      if (isMissingGodownSql(error.message)) return out;
      throw error;
    }
    for (const r of (data ?? []) as { doc_id: string; godowns?: { name?: string | null } | null }[]) {
      const name = r.godowns?.name;
      if (r.doc_id && name) out[String(r.doc_id)] = String(name);
    }
  }
  return out;
}

/**
 * An invoice made from a delivery challan goes out of the godown the challan was sent from.
 * Call after the invoice and its lines are saved. Never throws; returns what to tell the user,
 * or null when nothing worth a message happened (also when the challan went out of Main).
 */
export async function syncSaleFromChallanGodown(
  challanId: string,
  saleId: string,
): Promise<{ title: string; description: string } | null> {
  const failed = (e: unknown) => {
    const text = godownErrorText(e);
    return {
      title: "Invoice made. Goods went out of Main",
      description: isMissingGodownSql(text)
        ? 'Run the Phase 3 step 3d-1 SQL first, then open the invoice, pick the godown in "Dispatch from" and save.'
        : `${text.replace(/\.$/, "")}. Open the invoice, pick the godown in "Dispatch from" and save.`,
    };
  };
  let godownId: string | null;
  try {
    godownId = await fetchDocGodown("challan", challanId);
  } catch (e) {
    return failed(e);
  }
  if (!godownId) return null;
  try {
    return godownDocSyncWarning(await syncDocGodown("sale", saleId, godownId));
  } catch (e) {
    return failed(e);
  }
}
