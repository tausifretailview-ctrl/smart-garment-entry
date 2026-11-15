/**
 * Run a `.in(column, ids)` read in batches, every row (Plan Phase 4, speed + correctness).
 *
 * - A customer's bill ids, a supplier's bills, a school's students … can number in the thousands;
 *   all of them in one request makes the URL too long and the read fails. Batches of 200 run
 *   together.
 * - The server answers at most 1,000 rows per request and silently drops the rest (a big
 *   customer's bill lines easily pass that). Each batch is read page by page until a short page.
 *
 * `run(batch)` returns the query (not awaited); it must be ordered by a unique column (e.g.
 * `.order("id")`) so pages do not overlap. The first failed request throws. Rows come back in
 * batch order — sort afterwards if order matters.
 */
export const ID_BATCH_SIZE = 200;
export const SERVER_MAX_ROWS = 1000;

type RangeQuery<T> = { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> };

export async function fetchInIdBatches<T>(
  ids: readonly string[],
  run: (batch: string[]) => RangeQuery<T>,
  opts: { size?: number; pageRows?: number } = {},
): Promise<T[]> {
  const size = opts.size ?? ID_BATCH_SIZE;
  const pageRows = opts.pageRows ?? SERVER_MAX_ROWS;
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size));
  const perBatch = await Promise.all(
    batches.map(async (batch) => {
      const rows: T[] = [];
      for (let from = 0; ; from += pageRows) {
        const { data, error } = await run(batch).range(from, from + pageRows - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < pageRows) break;
      }
      return rows;
    }),
  );
  return perBatch.flat();
}

/**
 * Every row of one query, page by page past the 1,000-row server cap. `build()` returns a fresh
 * query ordered by a unique column (e.g. `.order("id")`). The first failed page throws.
 */
export async function fetchAllRows<T>(build: () => RangeQuery<T>, pageRows = SERVER_MAX_ROWS): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageRows) {
    const { data, error } = await build().range(from, from + pageRows - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageRows) break;
  }
  return rows;
}
