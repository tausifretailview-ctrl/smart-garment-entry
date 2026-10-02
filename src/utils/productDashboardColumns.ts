/** Empty display values that should not keep a product column on screen. */
export function isBlankDisplayValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "boolean") return false;
  const text = String(value).trim();
  return text === "" || text === "—" || text === "-" || text === "–";
}

/**
 * Keep a column when the page is empty or any row has a real value.
 * A column of only blanks is hidden.
 */
export function columnHasVisibleValue<T>(
  rows: readonly T[],
  read: (row: T) => unknown,
): boolean {
  if (rows.length === 0) return true;
  return rows.some((row) => !isBlankDisplayValue(read(row)));
}
