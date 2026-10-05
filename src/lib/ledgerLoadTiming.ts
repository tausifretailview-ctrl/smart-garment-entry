/**
 * In-memory timing of Customer Ledger loads (Accounts → Customer Ledger).
 *
 * No console output while recording. In DevTools:
 *   __ezzyLedgerPerf.print()   table of the last loads (wave 1, wave 2, total ms)
 *   __ezzyLedgerPerf.list()    same rows as data
 *   __ezzyLedgerPerf.clear()
 */

export type LedgerLoadTiming = {
  at: string;
  /** First 8 characters of the customer id. */
  customer: string;
  dateFiltered: boolean;
  wave1Ms: number;
  wave2Ms: number;
  totalMs: number;
  rows: number;
};

const MAX_ENTRIES = 30;
const entries: LedgerLoadTiming[] = [];
let exposed = false;

export function ledgerTimingNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function getLedgerLoadTimings(): LedgerLoadTiming[] {
  return entries.slice();
}

export function clearLedgerLoadTimings(): void {
  entries.length = 0;
}

function exposeApi(): void {
  if (exposed || typeof window === "undefined") return;
  exposed = true;
  (window as Window & { __ezzyLedgerPerf?: Record<string, unknown> }).__ezzyLedgerPerf = {
    list: getLedgerLoadTimings,
    clear: clearLedgerLoadTimings,
    print: () => console.table(getLedgerLoadTimings()),
  };
}

export function recordLedgerLoad(entry: LedgerLoadTiming): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  exposeApi();
}
