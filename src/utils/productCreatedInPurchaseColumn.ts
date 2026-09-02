import { supabase } from "@/integrations/supabase/client";

type ProductInsertResult = {
  data: any;
  error: { message?: string; code?: string } | null;
};

/** PostgREST PGRST204 / Postgres 42703 when products.created_in_purchase is not on the live DB. */
export function isMissingCreatedInPurchaseColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { message?: string; code?: string };
  const message = String(e.message ?? "");
  if (!message.includes("created_in_purchase")) return false;
  return (
    e.code === "PGRST204" ||
    e.code === "42703" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /could not find/i.test(message)
  );
}

export function omitCreatedInPurchaseField<T extends Record<string, unknown>>(
  payload: T,
): Omit<T, "created_in_purchase"> {
  const { created_in_purchase: _flag, ...rest } = payload;
  return rest;
}

type InsertProductsOptions = {
  select?: string;
  single?: boolean;
};

/**
 * Insert products with created_in_purchase when the column exists.
 * If PostgREST schema cache / Postgres reports the column missing, retry without it
 * so Purchase Entry can still create SKUs (recycle-bin 2h created_at fallback still applies).
 */
export async function insertProductsPreferringPurchaseFlag<T extends Record<string, unknown>>(
  rows: T | T[],
  options?: InsertProductsOptions,
): Promise<ProductInsertResult> {
  const list = Array.isArray(rows) ? rows : [rows];
  const first = await runInsert(list, options);
  if (!first.error || !isMissingCreatedInPurchaseColumn(first.error)) {
    return first;
  }
  return runInsert(list.map((row) => omitCreatedInPurchaseField(row)), options);
}

async function runInsert(
  rows: Record<string, unknown>[],
  options?: InsertProductsOptions,
): Promise<ProductInsertResult> {
  const q = supabase.from("products").insert(rows as never);
  if (options?.select) {
    const selected = q.select(options.select);
    if (options.single) {
      return (await selected.single()) as unknown as ProductInsertResult;
    }
    return (await selected) as unknown as ProductInsertResult;
  }
  return (await q) as unknown as ProductInsertResult;
}
