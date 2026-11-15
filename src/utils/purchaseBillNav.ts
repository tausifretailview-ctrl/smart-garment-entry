/**
 * Purchase Entry header bill navigation: which of Last / Previous / Next are off. Bills are
 * listed newest first, so Previous (older) stops at the end of the list and Next (newer) at 0.
 */
export function purchaseBillNavDisabled(
  isLoading: boolean,
  navIndex: number | null,
  /** Bills in the list; null while the list is not read yet (it is read when Last is used). */
  billCount: number | null,
): { last: boolean; previous: boolean; next: boolean } {
  return {
    // Unknown count (list not read yet) still allows Last: it reads the list on first use.
    last: isLoading || billCount === 0,
    previous: isLoading || navIndex === null || navIndex >= (billCount ?? 0) - 1,
    next: isLoading || navIndex === null || navIndex <= 0,
  };
}
