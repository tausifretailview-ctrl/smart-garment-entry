import { supabase } from "@/integrations/supabase/client";

/** Detect Postgres "column does not exist" errors (schema ahead/behind app). */
export function isMissingPgColumn(error: unknown, column: string): boolean {
  const msg = (
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : error instanceof Error
        ? error.message
        : String(error)
  ).toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) && (msg.includes("does not exist") || msg.includes("column"));
}

export function omitRecordKey<T extends Record<string, unknown>>(row: T, key: string): T {
  const next = { ...row };
  delete next[key];
  return next;
}

type UpsertResult = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  error: { message?: string } | null;
};

/** Upsert printer_presets; retries without h_gap when cloud DB predates that migration. */
export async function upsertPrinterPresetRow(
  row: Record<string, unknown>,
  options?: { onConflict?: string; single?: boolean; select?: string },
): Promise<UpsertResult> {
  const onConflict = options?.onConflict ?? "organization_id,name";
  const select = options?.select ?? "*";
  const wantSingle = options?.single !== false;

  const run = (payload: Record<string, unknown>) => {
    const base = supabase.from("printer_presets").upsert(payload, { onConflict }).select(select);
    return wantSingle ? base.single() : base;
  };

  let result = await run(row);

  if (result.error && isMissingPgColumn(result.error, "h_gap") && "h_gap" in row) {
    result = await run(omitRecordKey(row, "h_gap"));
  }

  return result as UpsertResult;
}
