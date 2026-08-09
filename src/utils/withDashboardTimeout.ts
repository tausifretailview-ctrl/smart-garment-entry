const DASHBOARD_SEARCH_TIMEOUT_MS = 25000;

/**
 * Race a dashboard search promise against a 25s ceiling so the UI surfaces
 * a clean error instead of leaving users on a blank/skeleton screen.
 */
export function withDashboardTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = DASHBOARD_SEARCH_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}
