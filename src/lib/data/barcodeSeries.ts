import { supabase } from "@/integrations/supabase/client";

/**
 * Barcodes from the shop's series (Plan Phase 4, speed).
 *
 * generateNextBarcodes asks for many at once (generate_next_barcodes, migration
 * 20270427120000) and, until that SQL is applied, falls back to one generate_next_barcode call
 * per barcode — one after another, never in parallel (parallel calls can return the same free
 * number, since nothing is saved yet).
 */

type RpcError = { code?: string; message?: string } | null;

export function isMissingBatchBarcodeRpc(err: RpcError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const msg = String(err.message || "");
  return /generate_next_barcodes/i.test(msg) && /schema cache|does not exist/i.test(msg);
}

/** Most barcodes asked for in one request. */
export const BARCODE_BATCH_SIZE = 1000;

/**
 * `count` new barcodes in series order. A failed single call leaves "" at that position (the
 * caller keeps its own fallback); a failed batch request throws.
 */
export async function generateNextBarcodes(
  orgId: string,
  count: number,
  onProgress?: (done: number) => void,
): Promise<string[]> {
  if (count <= 0) return [];
  const out: string[] = [];
  let batchAvailable = true;
  while (out.length < count && batchAvailable) {
    const want = Math.min(BARCODE_BATCH_SIZE, count - out.length);
    const { data, error } = await supabase.rpc("generate_next_barcodes" as never, {
      p_organization_id: orgId,
      p_count: want,
    } as never);
    if (error) {
      if (isMissingBatchBarcodeRpc(error as RpcError)) {
        batchAvailable = false;
        break;
      }
      throw error;
    }
    out.push(...((data as string[] | null) ?? []).map((b) => String(b ?? "")));
    onProgress?.(out.length);
  }
  // SQL not applied yet: one call per barcode, in order.
  while (out.length < count) {
    const { data } = await supabase.rpc("generate_next_barcode", { p_organization_id: orgId });
    out.push(data ? String(data) : "");
    onProgress?.(out.length);
  }
  return out;
}
