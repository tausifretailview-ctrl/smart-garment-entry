/**
 * Phase 0 — Supabase / cloud read diagnostics (dev-only).
 *
 * Enable in browser console or via URL:
 *   localStorage.setItem('ezzy_cloud_usage', '1'); location.reload();
 *   ?cloudusage=1
 *
 * Inspect: window.__ezzyCloudUsage.printReport()
 *          window.__ezzyCloudUsage.copyReport()
 *          window.__ezzyCloudUsage.reset()
 */

const STORAGE_KEY = "ezzy_cloud_usage";
const SESSION_FLAG_KEY = "ezzy_cloud_usage_session";
const MAX_EVENTS = 500;

export type CloudUsageEvent = {
  id: string;
  ts: number;
  method: string;
  path: string;
  table?: string;
  rpc?: string;
  status?: number;
  routePath: string;
  durationMs?: number;
};

type CloudUsageBucket = {
  routePath: string;
  requestCount: number;
  tables: Map<string, number>;
  rpcs: Map<string, number>;
};

let enabled = false;
let eventSeq = 0;
let activeRoutePath = "";
const events: CloudUsageEvent[] = [];
const buckets = new Map<string, CloudUsageBucket>();
let originalFetch: typeof fetch | null = null;
let patched = false;

function nextId(): string {
  eventSeq += 1;
  return `cloud-${eventSeq}`;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function log(...args: unknown[]): void {
  if (!enabled) return;
  console.log("[CloudUsage]", ...args);
}

function parseSupabasePath(url: string): { table?: string; rpc?: string; path: string } {
  try {
    const u = new URL(url, window.location.origin);
    const parts = u.pathname.split("/").filter(Boolean);
    const restIdx = parts.indexOf("rest");
    const rpcIdx = parts.indexOf("rpc");
    if (rpcIdx >= 0 && parts[rpcIdx + 1]) {
      return { rpc: parts[rpcIdx + 1], path: u.pathname };
    }
    if (restIdx >= 0 && parts[restIdx + 1] === "v1" && parts[restIdx + 2]) {
      return { table: parts[restIdx + 2], path: u.pathname };
    }
    return { path: u.pathname };
  } catch {
    return { path: url };
  }
}

function isSupabaseRequest(url: string): boolean {
  return (
    url.includes("/rest/v1/") ||
    url.includes("/rpc/") ||
    url.includes("supabase.co") ||
    url.includes("supabase.in")
  );
}

function touchBucket(routePath: string, table?: string, rpc?: string): void {
  const key = routePath || "(unknown)";
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { routePath: key, requestCount: 0, tables: new Map(), rpcs: new Map() };
    buckets.set(key, bucket);
  }
  bucket.requestCount += 1;
  if (table) bucket.tables.set(table, (bucket.tables.get(table) ?? 0) + 1);
  if (rpc) bucket.rpcs.set(rpc, (bucket.rpcs.get(rpc) ?? 0) + 1);
}

function patchFetch(): void {
  if (patched || typeof window === "undefined") return;
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const shouldTrack = enabled && isSupabaseRequest(url);
    const startedAt = shouldTrack ? now() : 0;
    const response = await originalFetch!(input, init);
    if (shouldTrack) {
      const parsed = parseSupabasePath(url);
      const evt: CloudUsageEvent = {
        id: nextId(),
        ts: startedAt,
        method: (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")).toUpperCase(),
        path: parsed.path,
        table: parsed.table,
        rpc: parsed.rpc,
        status: response.status,
        routePath: activeRoutePath,
        durationMs: now() - startedAt,
      };
      events.push(evt);
      if (events.length > MAX_EVENTS) events.shift();
      touchBucket(activeRoutePath, parsed.table, parsed.rpc);
      log(evt.method, parsed.table ?? parsed.rpc ?? parsed.path, `${Math.round(evt.durationMs ?? 0)}ms`, `@${activeRoutePath}`);
    }
    return response;
  };
  patched = true;
}

export function isCloudUsageDiagnosticsEnabled(): boolean {
  return enabled;
}

export function initCloudUsageDiagnostics(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cloudusage") === "1") {
      sessionStorage.setItem(SESSION_FLAG_KEY, "1");
      localStorage.setItem(STORAGE_KEY, "1");
    }
    enabled =
      localStorage.getItem(STORAGE_KEY) === "1" ||
      sessionStorage.getItem(SESSION_FLAG_KEY) === "1";
  } catch {
    enabled = false;
  }

  if (enabled) {
    patchFetch();
    exposeApi();
    log("enabled — use window.__ezzyCloudUsage.printReport()");
  }

  return enabled;
}

export function setCloudUsageDiagnosticsEnabled(next: boolean): void {
  enabled = next;
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, "1");
      sessionStorage.setItem(SESSION_FLAG_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_FLAG_KEY);
    }
  } catch {
    // ignore
  }
  if (next) {
    patchFetch();
    exposeApi();
  }
}

/** Call from pages to attribute Supabase traffic to the current ERP route. */
export function setCloudUsageRoutePath(path: string): void {
  activeRoutePath = path;
}

export function getCloudUsageEvents(): CloudUsageEvent[] {
  return [...events];
}

export function resetCloudUsageCounters(): void {
  events.length = 0;
  buckets.clear();
  eventSeq = 0;
  log("counters reset");
}

export function buildCloudUsageReport(): string {
  const lines: string[] = [
    "=== EzzyERP Cloud Usage Report (Phase 0) ===",
    `Generated: ${new Date().toISOString()}`,
    `Total Supabase requests: ${events.length}`,
    "",
    "By route (window tab path):",
  ];

  const sortedBuckets = [...buckets.values()].sort((a, b) => b.requestCount - a.requestCount);
  if (sortedBuckets.length === 0) {
    lines.push("  (none yet — navigate to Accounts, POS, Sales Dashboard, etc.)");
  } else {
    for (const b of sortedBuckets) {
      lines.push(`  ${b.routePath}: ${b.requestCount} requests`);
      const tables = [...b.tables.entries()].sort((a, c) => c[1] - a[1]);
      for (const [table, count] of tables.slice(0, 8)) {
        lines.push(`    - ${table}: ${count}`);
      }
      const rpcs = [...b.rpcs.entries()].sort((a, c) => c[1] - a[1]);
      for (const [rpc, count] of rpcs.slice(0, 8)) {
        lines.push(`    - rpc/${rpc}: ${count}`);
      }
    }
  }

  lines.push("", "Recent requests (last 40):");
  for (const e of events.slice(-40)) {
    const target = e.rpc ? `rpc/${e.rpc}` : e.table ?? e.path;
    lines.push(
      `  ${e.method} ${target} ${e.status ?? ""} ${Math.round(e.durationMs ?? 0)}ms @${e.routePath}`,
    );
  }

  lines.push(
    "",
    "Baseline journey (run after enabling):",
    "  1. Login → POS (wait 30s) → Sales Dashboard → Accounts → Customer Ledger → POS",
    "  2. window.__ezzyCloudUsage.printReport()",
    "  3. Compare request counts before/after Phase 1 savings",
  );

  return lines.join("\n");
}

export function printCloudUsageReport(): void {
  console.log(buildCloudUsageReport());
}

export async function copyCloudUsageReport(): Promise<void> {
  const text = buildCloudUsageReport();
  try {
    await navigator.clipboard.writeText(text);
    log("report copied to clipboard");
  } catch {
    console.log(text);
  }
}

function exposeApi(): void {
  (window as Window & { __ezzyCloudUsage?: Record<string, unknown> }).__ezzyCloudUsage = {
    enabled: () => enabled,
    enable: () => setCloudUsageDiagnosticsEnabled(true),
    disable: () => setCloudUsageDiagnosticsEnabled(false),
    reset: resetCloudUsageCounters,
    getEvents: getCloudUsageEvents,
    printReport: printCloudUsageReport,
    copyReport: copyCloudUsageReport,
    buildReport: buildCloudUsageReport,
    setRoutePath: setCloudUsageRoutePath,
  };
}
