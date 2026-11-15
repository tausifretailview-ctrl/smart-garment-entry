import { supabase } from "@/integrations/supabase/client";

/**
 * Replace all lines of a document (challan, sale order, quotation, purchase order) when it is
 * edited and saved (Plan Phase 4, R6).
 *
 * These screens deleted the old lines without checking, then inserted the new ones:
 * - a failed delete left the old lines in place, so the insert doubled every quantity;
 * - a failed insert (network, a database rule) left the document with no lines at all,
 *   while the screen still said it was saved.
 * Now: read the old lines, delete (checked), insert (checked); if the insert fails, the old
 * lines are put back and the error is thrown so the screen shows "save failed".
 */
export type DocumentLineTable =
  | "delivery_challan_items"
  | "sale_order_items"
  | "quotation_items"
  | "purchase_order_items";

export async function replaceDocumentLines(opts: {
  table: DocumentLineTable;
  parentColumn: string;
  parentId: string;
  rows: Record<string, unknown>[];
}): Promise<void> {
  const { table, parentColumn, parentId, rows } = opts;
  // Loose client: the four tables share this flow but have different row types.
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> };
      delete: () => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
      insert: (r: Record<string, unknown>[]) => Promise<{ error: unknown }>;
    };
  };

  const { data: previous, error: readErr } = await db.from(table).select("*").eq(parentColumn, parentId);
  if (readErr) throw readErr;

  const { error: deleteErr } = await db.from(table).delete().eq(parentColumn, parentId);
  if (deleteErr) throw deleteErr;

  if (rows.length === 0) return;
  const { error: insertErr } = await db.from(table).insert(rows);
  if (insertErr) {
    if (previous && previous.length > 0) {
      const { error: restoreErr } = await db.from(table).insert(previous);
      if (restoreErr) console.error(`Could not restore ${table} after a failed save:`, restoreErr);
    }
    throw insertErr;
  }
}

/**
 * Save an edited document — header and all lines — in one database transaction
 * (save_document_with_lines, migration 20270426120000). Until that SQL is run, falls back to
 * the old steps: update the header (checked), then replaceDocumentLines.
 */
export type DocumentKind = "quotation" | "sale_order" | "purchase_order" | "delivery_challan";

const DOCUMENT_TABLES: Record<DocumentKind, { header: string; lines: DocumentLineTable; parentColumn: string }> = {
  quotation: { header: "quotations", lines: "quotation_items", parentColumn: "quotation_id" },
  sale_order: { header: "sale_orders", lines: "sale_order_items", parentColumn: "order_id" },
  purchase_order: { header: "purchase_orders", lines: "purchase_order_items", parentColumn: "order_id" },
  delivery_challan: { header: "delivery_challans", lines: "delivery_challan_items", parentColumn: "challan_id" },
};

type RpcError = { code?: string; message?: string } | null;

/** True when save_document_with_lines is not in the database yet (SQL pending). */
export function isMissingSaveDocumentRpc(err: RpcError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const msg = String(err.message || "");
  return /save_document_with_lines/i.test(msg) && /schema cache|does not exist/i.test(msg);
}

export async function saveDocumentWithLines(opts: {
  kind: DocumentKind;
  organizationId: string;
  documentId: string;
  header: Record<string, unknown>;
  rows: Record<string, unknown>[];
}): Promise<"one-step" | "steps"> {
  const { kind, organizationId, documentId, header, rows } = opts;
  const tables = DOCUMENT_TABLES[kind];

  const { data, error } = await supabase.rpc("save_document_with_lines" as never, {
    p_kind: kind,
    p_organization_id: organizationId,
    p_document_id: documentId,
    p_header: header,
    p_lines: rows,
  } as never);
  if (!error) {
    if (!(data && typeof data === "object" && (data as { success?: boolean }).success === true)) {
      throw new Error("The document was not saved. Please try again.");
    }
    return "one-step";
  }
  if (!isMissingSaveDocumentRpc(error as RpcError)) throw error;

  // SQL not applied yet: the old steps, each checked.
  const db = supabase as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
      };
    };
  };
  const { error: headerErr } = await db
    .from(tables.header)
    .update(header)
    .eq("id", documentId)
    .eq("organization_id", organizationId);
  if (headerErr) throw headerErr;
  await replaceDocumentLines({ table: tables.lines, parentColumn: tables.parentColumn, parentId: documentId, rows });
  return "steps";
}
