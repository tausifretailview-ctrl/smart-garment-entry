import type { SupabaseClient } from "@supabase/supabase-js";

/** Each sale_item row fires FIFO stock + total_qty triggers — keep chunks small. */
const DEFAULT_CHUNK_SIZE = 5;

export function isStatementTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("statement timeout") ||
    msg.includes("canceling statement") ||
    msg.includes("query_canceled")
  );
}

export function saleSaveTimeoutMessage(): string {
  return "Saving took too long (server busy). Please wait a few seconds and try again.";
}

/**
 * Insert sale_items in small chunks to stay under Postgres statement_timeout.
 * On timeout within a chunk, retries row-by-row for that chunk only.
 */
export async function insertSaleItemsInChunks(
  client: SupabaseClient,
  rows: Record<string, unknown>[],
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<void> {
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from("sale_items").insert(chunk as never);
    if (!error) continue;

    if (isStatementTimeoutError(error) && chunk.length > 1) {
      for (const row of chunk) {
        const { error: rowErr } = await client.from("sale_items").insert(row as never);
        if (rowErr) throw rowErr;
      }
      continue;
    }

    throw error;
  }
}
