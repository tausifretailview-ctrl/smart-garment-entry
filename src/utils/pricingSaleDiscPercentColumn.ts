/** PostgREST PGRST204 / Postgres 42703 when products.pricing_sale_disc_percent is not on the live DB. */
export function isMissingPricingSaleDiscPercentColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { message?: string; code?: string };
  const message = String(e.message ?? "");
  if (!message.includes("pricing_sale_disc_percent")) return false;
  return (
    e.code === "PGRST204" ||
    e.code === "42703" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /could not find/i.test(message)
  );
}

export function omitPricingSaleDiscPercentField<T extends object>(
  payload: T,
): Omit<T, "pricing_sale_disc_percent"> {
  const { pricing_sale_disc_percent: _disc, ...rest } = payload as T & {
    pricing_sale_disc_percent?: unknown;
  };
  return rest;
}
