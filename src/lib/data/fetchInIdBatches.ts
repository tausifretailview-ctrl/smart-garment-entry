/**
 * Run a `.in(column, ids)` read in batches (Plan Phase 4, speed).
 *
 * A customer's bill ids, a bill's variant ids, … can number in the thousands; all of them in one
 * request makes the URL too long for the server and the read fails. Batches of 200 run together;
 * the first failed batch throws. Rows come back in batch order (sort afterwards if order matters).
 */
export const ID_BATCH_SIZE = 200;

export async function fetchInIdBatches<T>(
  ids: readonly string[],
  run: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = ID_BATCH_SIZE,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size));
  const results = await Promise.all(batches.map((b) => run(b)));
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return results.flatMap((r) => r.data ?? []);
}
