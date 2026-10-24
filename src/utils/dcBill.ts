/**
 * POS bill of only DC (No GST) items → DC number series (DC/26-27/N).
 * A bill with any normal item keeps the POS series.
 */

export type DcCartLine = { isDcProduct?: boolean | null };

export function isAllDcCart(items: readonly DcCartLine[] | null | undefined): boolean {
  return !!items && items.length > 0 && items.every((i) => i?.isDcProduct === true);
}

/** True when the DC numbering SQL is not on the database yet (function missing). */
export function isMissingDcNumberFunction(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    /generate_dc_number_atomic/i.test(String(e.message || ""))
  );
}
