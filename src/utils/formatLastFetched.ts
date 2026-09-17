/** Compact last-fetched label for owner-home (IST wall clock — same TZ as POS sale_date). */

const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatLastFetchedLabel(
  dataUpdatedAtMs: number,
  options?: { fetching?: boolean },
): string {
  if (options?.fetching) return "Updating…";
  if (!dataUpdatedAtMs) return "";
  return `Updated ${IST_TIME.format(new Date(dataUpdatedAtMs))}`;
}
