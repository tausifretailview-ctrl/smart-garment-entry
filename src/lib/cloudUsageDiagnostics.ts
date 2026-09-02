/**
 * Opt-in Supabase / cloud read diagnostics (never auto-on in DEV).
 *
 * Enable in browser console or via URL:
 *   localStorage.setItem('ezzy_cloud_usage', '1'); location.reload();
 *   ?cloudusage=1
 *
 * Inspect: window.__ezzyCloudUsage.printReport()
 *          window.__ezzyCloudUsage.copyJson()
 *          window.__ezzyCloudUsage.reset()
 *
 * Route attribution: OrgLayout sets the window-tab path. Quick Payments sets a
 * short overlay (`pos-sales:quick-payments`) so the picker is a separate bucket.
 */

const STORAGE_KEY = "ezzy_cloud_usage";
const SESSION_FLAG_KEY = "ezzy_cloud_usage_session";
const MAX_EVENTS = 500;

/** RPCs Phases 2–4 expect on the StatusBar / Accounts / dashboard journey. */
export const PHASE6_EXPECTED_RPCS = [
  "get_dashboard_stock_summary",
  "get_dashboard_purchase_summary",
  "get_accounts_dashboard_metrics",
] as const;

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

export type CloudUsageJsonReport = {
  generated: string;
  phase: "6";
  totalRequests: number;
  attributedPath: string;
  byRoute: Array<{
    routePath: string;
    requestCount: number;
    tables: Record<string, number>;
    rpcs: Record<string, number>;
  }>;
  recent: Array<{
    method: string;
    target: string;
    status?: number;
    durationMs?: number;
    routePath: string;
  }>;
  expectedRpcs: readonly string[];
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
let overlayRoutePath: string | null = null;
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

export function parseSupabasePath(url: string): { table?: string; rpc?: string; path: string } {
  try {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://placeholder.local";
    const u = new URL(url, origin);
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

export function isSupabaseRequest(url: string): boolean {
  return (
    url.includes("/rest/v1/") ||
    url.includes("/rpc/") ||
    url.includes("supabase.co") ||
    url.includes("supabase.in")
  );
}

export function getCloudUsageAttributedPath(): string {
  return overlayRoutePath || activeRoutePath || "(unknown)";
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

/** Record one tracked request. Used by the fetch wrapper and by unit tests. */
export function recordSupabaseUsage(opts: {
  url: string;
  method?: string;
  status?: number;
  durationMs?: number;
}): CloudUsageEvent | null {
  if (!isSupabaseRequest(opts.url)) return null;
  const parsed = parseSupabasePath(opts.url);
  const routePath = getCloudUsageAttributedPath();
  const evt: CloudUsageEvent = {
    id: nextId(),
    ts: now(),
    method: (opts.method ?? "GET").toUpperCase(),
    path: parsed.path,
    table: parsed.table,
    rpc: parsed.rpc,
    status: opts.status,
    routePath,
    durationMs: opts.durationMs,
  };
  events.push(evt);
  if (events.length > MAX_EVENTS) events.shift();
  touchBucket(routePath, parsed.table, parsed.rpc);
  log(evt.method, parsed.table ?? parsed.rpc ?? parsed.path, `${Math.round(evt.durationMs ?? 0)}ms`, `@${routePath}`);
  return evt;
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
      recordSupabaseUsage({
        url,
        method:
          init?.method ??
          (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET"),
        status: response.status,
        durationMs: now() - startedAt,
      });
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

/** Call from OrgLayout (or a page) to attribute traffic to the current ERP route. */
export function setCloudUsageRoutePath(path: string): void {
  activeRoutePath = path;
}

/**
 * Temporary overlay (Quick Payments). Does not wipe the OrgLayout path, so
 * closing the dialog returns counts to the underlying tab.
 */
export function setCloudUsageRouteOverlay(path: string | null): void {
  overlayRoutePath = path;
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

function mapFromEntries(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

export function buildCloudUsageJson(): CloudUsageJsonReport {
  const sortedBuckets = [...buckets.values()].sort((a, b) => b.requestCount - a.requestCount);
  return {
    generated: new Date().toISOString(),
    phase: "6",
    totalRequests: events.length,
    attributedPath: getCloudUsageAttributedPath(),
    byRoute: sortedBuckets.map((b) => ({
      routePath: b.routePath,
      requestCount: b.requestCount,
      tables: mapFromEntries(b.tables),
      rpcs: mapFromEntries(b.rpcs),
    })),
    recent: events.slice(-40).map((e) => ({
      method: e.method,
      target: e.rpc ? `rpc/${e.rpc}` : e.table ?? e.path,
      status: e.status,
      durationMs: e.durationMs,
      routePath: e.routePath,
    })),
    expectedRpcs: PHASE6_EXPECTED_RPCS,
  };
}

export function buildCloudUsageReport(): string {
  const json = buildCloudUsageJson();
  const lines: string[] = [
    "=== EzzyERP Cloud Usage Report (Phase 6) ===",
    `Generated: ${json.generated}`,
    `Total Supabase requests: ${json.totalRequests}`,
    `Attributed path: ${json.attributedPath}`,
    "",
    "By route (window tab path):",
  ];

  if (json.byRoute.length === 0) {
    lines.push("  (none yet — navigate to Accounts, POS, Sales Dashboard, etc.)");
  } else {
    for (const b of json.byRoute) {
      lines.push(`  ${b.routePath}: ${b.requestCount} requests`);
      for (const [table, count] of Object.entries(b.tables).slice(0, 8)) {
        lines.push(`    - ${table}: ${count}`);
      }
      for (const [rpc, count] of Object.entries(b.rpcs).slice(0, 8)) {
        lines.push(`    - rpc/${rpc}: ${count}`);
      }
    }
  }

  lines.push("", "Recent requests (last 40):");
  for (const e of json.recent) {
    lines.push(
      `  ${e.method} ${e.target} ${e.status ?? ""} ${Math.round(e.durationMs ?? 0)}ms @${e.routePath}`,
    );
  }

  lines.push(
    "",
    "Phase 6 expected RPCs (StatusBar / Accounts after Phases 2–4):",
    ...PHASE6_EXPECTED_RPCS.map((rpc) => `  - rpc/${rpc}`),
    "",
    "Baseline journey (run after enabling):",
    "  1. Login → POS (wait 30s) → Sales Dashboard → Accounts → Customer Ledger → POS",
    "  2. Open Quick Payments → pick a customer → close",
    "  3. window.__ezzyCloudUsage.printReport()  OR  .copyJson()",
    "  4. Paste into docs/cloud-usage-baseline.md Phase 6 capture slots",
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

export async function copyCloudUsageJson(): Promise<void> {
  const text = JSON.stringify(buildCloudUsageJson(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    log("JSON report copied to clipboard");
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
    copyJson: copyCloudUsageJson,
    buildReport: buildCloudUsageReport,
    buildJson: buildCloudUsageJson,
    setRoutePath: setCloudUsageRoutePath,
    setRouteOverlay: setCloudUsageRouteOverlay,
    routePath: getCloudUsageAttributedPath,
  };
}
