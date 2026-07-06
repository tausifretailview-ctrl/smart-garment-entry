export type BackupFetchFilter =
  | { column: string; value: string }
  | { column: string; inValues: string[] };

const ROW_CAP = 500_000;
const IN_CHUNK_SIZE = 200;

export async function fetchAllRows(
  supabase: { from: (table: string) => unknown },
  table: string,
  filter: BackupFetchFilter,
  pageSize = 1000,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const allRows: Record<string, unknown>[] = [];

  const checkCap = (offset: number): string | null => {
    if (allRows.length >= ROW_CAP) {
      return `${table}: row cap exceeded at offset ${offset}`;
    }
    return null;
  };

  const paginateQuery = async (
    buildQuery: (offset: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
  ): Promise<string | null> => {
    let offset = 0;
    while (true) {
      const capErr = checkCap(offset);
      if (capErr) return capErr;

      const { data, error } = await buildQuery(offset);
      if (error) {
        return `${table}: ${error.message} at offset ${offset}`;
      }

      const page = data || [];
      allRows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return null;
  };

  let fetchError: string | null = null;

  if ("value" in filter) {
    fetchError = await paginateQuery((offset) => {
      const client = supabase.from(table) as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              range: (from: number, to: number) => Promise<{
                data: Record<string, unknown>[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
      return client
        .select("*")
        .eq(filter.column, filter.value)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
    });
  } else {
    if (filter.inValues.length === 0) {
      return { rows: [], error: null };
    }

    for (let i = 0; i < filter.inValues.length; i += IN_CHUNK_SIZE) {
      const chunk = filter.inValues.slice(i, i + IN_CHUNK_SIZE);
      const chunkError = await paginateQuery((offset) => {
        const client = supabase.from(table) as {
          select: (cols: string) => {
            in: (col: string, vals: string[]) => {
              order: (col: string, opts: { ascending: boolean }) => {
                range: (from: number, to: number) => Promise<{
                  data: Record<string, unknown>[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
        return client
          .select("*")
          .in(filter.column, chunk)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
      });
      if (chunkError) {
        fetchError = chunkError;
        break;
      }
    }
  }

  if (fetchError) {
    return { rows: [], error: fetchError };
  }

  return { rows: allRows, error: null };
}
