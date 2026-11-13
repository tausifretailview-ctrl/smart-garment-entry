/**
 * Purchase Entry header bill navigation: which of Last / Previous / Next are off. Bills are
 * listed newest first, so Previous (older) stops at the end of the list and Next (newer) at 0.
 */
export function purchaseBillNavDisabled(
  isLoading: boolean,
  navIndex: number | null,
  /** Bills in the list; null while the list is not loaded. */
  billCount: number | null,
): { last: boolean; previous: boolean; next: boolean } {
  return {
    last: isLoading || !billCount,
    previous: isLoading || navIndex === null || navIndex >= (billCount ?? 0) - 1,
    next: isLoading || navIndex === null || navIndex <= 0,
  };
}
