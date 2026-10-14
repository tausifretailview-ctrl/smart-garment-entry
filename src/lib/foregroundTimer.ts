/**
 * Load-rescue timers that count only time the page could actually load.
 *
 * A plain `setTimeout(cb, 4000)` fires immediately after a long main-thread freeze
 * (or a throttled background window). MOTAS HEALTHY desktop app, 2026-10-14: the
 * first tick after a ~20s freeze logged "Soft-retry cold chunk (20s)" and "Slow chunk
 * still loading (20s, budget 10s)" together, and the 4s Outlet rescue fired in the
 * same instant. The rescue reset the chunk and swapped the screen to a skeleton
 * just as the page was about to paint, so the user saw a blank/skeleton page and
 * reloaded by hand.
 *
 * Each tick adds at most `maxStepMs`, and hidden-tab time adds nothing, so a frozen
 * or throttled stretch counts as one short step instead of the whole gap.
 */

export const FOREGROUND_TICK_MS = 250;
export const FOREGROUND_MAX_STEP_MS = 1_000;

/** Elapsed time a single tick may add. Exported for tests. */
export function foregroundStepMs(
  deltaMs: number,
  hidden: boolean,
  maxStepMs = FOREGROUND_MAX_STEP_MS,
): number {
  if (hidden || !Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return Math.min(deltaMs, maxStepMs);
}

export type ForegroundTimerOptions = {
  tickMs?: number;
  maxStepMs?: number;
};

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/**
 * Call `onFire(elapsedMs)` once after `budgetMs` of foreground time.
 * Returns a cancel function (safe to call more than once).
 */
export function startForegroundTimer(
  budgetMs: number,
  onFire: (elapsedMs: number) => void,
  options: ForegroundTimerOptions = {},
): () => void {
  const tickMs = options.tickMs ?? FOREGROUND_TICK_MS;
  const maxStepMs = options.maxStepMs ?? FOREGROUND_MAX_STEP_MS;
  let elapsed = 0;
  let lastTick = Date.now();
  let done = false;

  const id = window.setInterval(() => {
    const now = Date.now();
    elapsed += foregroundStepMs(now - lastTick, isDocumentHidden(), maxStepMs);
    lastTick = now;
    if (elapsed < budgetMs) return;
    done = true;
    window.clearInterval(id);
    onFire(elapsed);
  }, tickMs);

  return () => {
    if (done) return;
    done = true;
    window.clearInterval(id);
  };
}
