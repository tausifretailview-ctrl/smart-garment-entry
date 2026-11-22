import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, type RangeQuery } from "@/lib/data/fetchInIdBatches";
import { isMissingSaveDocumentRpc } from "@/lib/data/replaceDocumentLines";
import {
  insertSaleItemsInChunks,
  insertSaleItemsResilient,
  isStatementTimeoutError,
} from "@/utils/insertSaleItemsInChunks";

/**
 * Save an EDITED sale bill (POS bill, Sale Bill, a held bill being completed) or an edited sale
 * return: all its lines and the header, in one database transaction
 * (save_document_with_lines kinds 'sale' / 'sale_return', migration 20270513120000).
 *
 * Before (review items B1, B2, B4): the browser deleted the old lines, inserted the new ones
 * (sale lines 5 at a time) and then updated the header, each as its own request. A dropped
 * connection in the middle left the bill with lines missing under the old totals; the Sale
 * Bill's "restore" re-added the old lines on top of the new ones that had saved (stock taken
 * twice); a sale return was left with no lines but its full credit.
 *
 * Now: one request, all or nothing. While the SQL has not been run (or the single statement
 * times out on a very large bill) the old steps are used, with a restore that first clears
 * whatever part of the new lines did save.
 */
export type SaleEditKind = "sale" | "sale_return";

const TABLES: Record<SaleEditKind, { header: string; lines: string; parentColumn: string }> = {
  sale: { header: "sales", lines: "sale_items", parentColumn: "sale_id" },
  sale_return: { header: "sale_returns", lines: "sale_return_items", parentColumn: "return_id" },
};

type DbError = { code?: string; message?: string } | null;
type Row = Record<string, unknown>;

export type SaleEditResult = {
  /** "one-step" = the database function; "steps" = the old separate requests. */
  mode: "one-step" | "steps";
  /** The header row as saved. */
  header: Row | null;
  /** Steps mode only: sale_items.salesman is not in the database yet, lines saved without it. */
  salesmanColumnMissing: boolean;
};

/** Lines lost for good: the new lines failed and the old ones could not be put back. */
export class SaleLinesNotRestoredError extends Error {
  constructor(public readonly original: unknown) {
    super("The bill could not be saved and its previous lines could not be restored. Do not close this bill: save it again.");
    this.name = "SaleLinesNotRestoredError";
  }
}

/** The one-step save cannot serve this call, so the old steps run instead. */
export function shouldSaveSaleEditInSteps(err: DbError): boolean {
  if (!err) return false;
  // SQL not run at all.
  if (isMissingSaveDocumentRpc(err)) return true;
  // The earlier version of the function (quotations, orders, challans only).
  if (err.code === "22023" && /unknown document kind/i.test(String(err.message || ""))) return true;
  // One statement for the whole bill was too slow: everything rolled back, so the chunked
  // steps start from the unchanged bill, as they always did.
  return err.code === "57014" || isStatementTimeoutError(err);
}

type LooseDb = {
  rpc: (fn: string, args: Row) => PromiseLike<{ data: unknown; error: DbError }>;
  from: (table: string) => {
    select: (cols: string) => { eq: (k: string, v: string) => { order: (c: string) => RangeQuery<Row> } };
    delete: () => { eq: (k: string, v: string) => PromiseLike<{ error: DbError }> };
    insert: (rows: Row[]) => PromiseLike<{ error: DbError }>;
    update: (patch: Row) => {
      eq: (k: string, v: string) => {
        eq: (k: string, v: string) => { select: () => { single: () => PromiseLike<{ data: Row | null; error: DbError }> } };
      };
    };
  };
};

/**
 * Old path, made safe: replace the lines in separate requests, and if the new lines fail put
 * the bill back exactly as it was (clear the part that saved, then re-add the old lines).
 */
export async function replaceSaleLinesInSteps(opts: {
  kind: SaleEditKind;
  documentId: string;
  rows: Row[];
}): Promise<{ salesmanColumnMissing: boolean }> {
  const { kind, documentId, rows } = opts;
  const { lines, parentColumn } = TABLES[kind];
  const db = supabase as unknown as LooseDb;

  const previous = await fetchAllRows<Row>(() => db.from(lines).select("*").eq(parentColumn, documentId).order("id"));

  const { error: deleteErr } = await db.from(lines).delete().eq(parentColumn, documentId);
  if (deleteErr) throw deleteErr;

  const insertLines = async (toInsert: Row[]): Promise<boolean> => {
    if (toInsert.length === 0) return false;
    if (kind === "sale") {
      const res = await insertSaleItemsResilient(supabase, toInsert);
      return res.salesmanColumnMissing;
    }
    const { error } = await db.from(lines).insert(toInsert);
    if (error) throw error;
    return false;
  };

  try {
    return { salesmanColumnMissing: await insertLines(rows) };
  } catch (insertErr) {
    // Some of the new lines may have saved. Remove them before the old ones go back, or the
    // bill ends up with both and the stock is taken twice.
    const { error: clearErr } = await db.from(lines).delete().eq(parentColumn, documentId);
    if (clearErr) {
      console.error(`Could not clear partly saved ${lines} after a failed save:`, clearErr);
      throw new SaleLinesNotRestoredError(insertErr);
    }
    if (previous.length > 0) {
      const restoreRows = previous.map(({ id: _id, created_at: _createdAt, ...rest }) => rest);
      try {
        if (kind === "sale") await insertSaleItemsInChunks(supabase, restoreRows);
        else {
          const { error: restoreErr } = await db.from(lines).insert(restoreRows);
          if (restoreErr) throw restoreErr;
        }
      } catch (restoreErr) {
        console.error(`Could not restore ${lines} after a failed save:`, restoreErr);
        throw new SaleLinesNotRestoredError(insertErr);
      }
    }
    throw insertErr;
  }
}

export async function saveSaleEditWithLines(opts: {
  kind: SaleEditKind;
  organizationId: string;
  documentId: string;
  /** Header columns to write (never id / organization_id). */
  header: Row;
  rows: Row[];
}): Promise<SaleEditResult> {
  const { kind, organizationId, documentId, header, rows } = opts;
  const db = supabase as unknown as LooseDb;

  const { data, error } = await db.rpc("save_document_with_lines", {
    p_kind: kind,
    p_organization_id: organizationId,
    p_document_id: documentId,
    p_header: header,
    p_lines: rows,
  });
  if (!error) {
    const result = (data ?? null) as { success?: boolean; header?: Row | null } | null;
    if (!result || result.success !== true) throw new Error("The bill was not saved. Please try again.");
    return { mode: "one-step", header: result.header ?? null, salesmanColumnMissing: false };
  }
  if (!shouldSaveSaleEditInSteps(error)) throw error;

  const { salesmanColumnMissing } = await replaceSaleLinesInSteps({ kind, documentId, rows });
  const { data: saved, error: headerErr } = await db
    .from(TABLES[kind].header)
    .update(header)
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .select()
    .single();
  if (headerErr) throw headerErr;
  return { mode: "steps", header: saved, salesmanColumnMissing };
}
