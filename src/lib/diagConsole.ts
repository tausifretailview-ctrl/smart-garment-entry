/**
 * Opt-in diagnostics console. Production stays quiet unless a flag is set.
 *
 * Historical: console.log in fetchAllRows / POS / Dashboard serialized on
 * the main thread and made the app feel frozen. Do not log on hot paths.
 *
 * Enable (then reload, then remove the key when done):
 *   localStorage.setItem("ezzy_nav_perf", "1")
 *   localStorage.setItem("ezzy_cloud_usage", "1")
 *   localStorage.setItem("ezzy_main_thread", "1")
 *   localStorage.setItem("ezzy_pwa_cold_open", "1")
 *
 * Or query: ?navperf=1  ?mainthread=1  ?pwacold=1
 */

export function isDiagConsoleEnabled(
  storageKey: string,
  queryToken?: string,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem(storageKey) === "1") return true;
  } catch {
    /* private mode / blocked storage */
  }
  if (queryToken && typeof window.location?.search === "string") {
    try {
      return new URLSearchParams(window.location.search).get(queryToken) === "1";
    } catch {
      return false;
    }
  }
  return false;
}

export function diagConsoleInfo(
  storageKey: string,
  queryToken: string | undefined,
  ...args: unknown[]
): void {
  if (!isDiagConsoleEnabled(storageKey, queryToken)) return;
  console.info(...args);
}
