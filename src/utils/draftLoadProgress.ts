/** Share of a draft bill's lines loaded so far, 0–100 (0 when the total is unknown). */
export function draftLoadPercent(loaded: number, total: number): number {
  return total > 0 ? (loaded / total) * 100 : 0;
}
