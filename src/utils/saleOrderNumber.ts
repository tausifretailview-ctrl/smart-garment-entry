/** True when Postgres unique on (organization_id, order_number) fired. */
export function isSaleOrderNumberConflict(error: {
  code?: string;
  message?: string;
  details?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const blob = `${error.code || ""} ${error.message || ""} ${error.details || ""}`;
  const isDup = error.code === "23505" || /duplicate key/i.test(blob);
  if (!isDup) return false;
  return /order_number|sale_orders_organization_order_number/i.test(blob);
}

/** peek_sale_order_number is not on production until the race-safe migration is applied. */
export function isMissingSaleOrderNumberRpc(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const msg = String(error.message || "");
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(msg)
  );
}

/** IST Apr–Mar prefix, e.g. SO/26-27/ — matches generate_sale_order_number. */
export function saleOrderFyPrefixIst(now = new Date()): string {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const m = ist.getMonth() + 1;
  const y = ist.getFullYear();
  const fyStart = m >= 4 ? y : y - 1;
  return `SO/${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}/`;
}
