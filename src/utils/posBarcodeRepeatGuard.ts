/**
 * POS scan repeat guard. One physical scan can reach the handler twice (scanner
 * sends CR+LF, or Enter plus a submit path) a few ms apart; a cashier who scans
 * the same barcode again on purpose is at least a few hundred ms later.
 *
 * Only the double-fire is swallowed. It used to swallow every repeat for 5s, so a
 * second scan of the same item did nothing and only the third one added qty.
 */
export const POS_BARCODE_REPEAT_WINDOW_MS = 300;

const recentScanAt = new Map<string, number>();

export function shouldSwallowPosRepeatBarcodeScan(barcode: string, now: number = Date.now()): boolean {
  const key = barcode.trim();
  if (!key) return false;
  const last = recentScanAt.get(key);
  return last != null && now - last < POS_BARCODE_REPEAT_WINDOW_MS;
}

export function recordPosBarcodeScanSuccess(barcode: string, now: number = Date.now()): void {
  const key = barcode.trim();
  if (!key) return;
  recentScanAt.set(key, now);
  for (const [k, t] of recentScanAt) {
    if (now - t >= POS_BARCODE_REPEAT_WINDOW_MS) recentScanAt.delete(k);
  }
}

export function resetPosBarcodeRepeatGuard(): void {
  recentScanAt.clear();
}
