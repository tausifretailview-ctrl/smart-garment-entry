import { resolveTabCachePath, TAB_PAGE_REGISTRY } from "@/lib/tabPageRegistry";

export type TabLoadShell = "entry" | "dashboard" | "page";

const DASHBOARD_TAB_PATHS = new Set(["", "dashboard"]);

/**
 * Map every tab-cache route to an existing shell (no new skeleton system).
 * - entry → AppBootSplash "Loading bill screen…"
 * - dashboard → DashboardSkeleton (web) / splash (Electron)
 * - page → AppBootSplash "Loading page…" (immediate — never bare spinner for 8s)
 *
 * Unknown / non-registry destinations (Insights) return `"page"` so Outlet
 * LazyFallback still paints a named splash instead of a silent empty frame.
 */
export function resolveTabLoadShell(path: string): TabLoadShell {
  const resolved = resolveTabCachePath(path);
  const def = TAB_PAGE_REGISTRY[resolved];
  if (DASHBOARD_TAB_PATHS.has(resolved)) return "dashboard";
  if (!def) return "page";
  if (def.layout === "pos" || def.layout === "pos-dc") return "entry";
  // Bill/product entry screens — not voucher pages that merely end in "-entry"
  // (e.g. third-party-entry is an accounts form, not a bill screen).
  if (
    resolved === "sales-invoice" ||
    (resolved.endsWith("-entry") &&
      resolved !== "third-party-entry" &&
      !resolved.startsWith("third-party"))
  ) {
    return "entry";
  }
  if (
    def.layout === "layout" ||
    resolved.includes("dashboard") ||
    resolved.endsWith("-report") ||
    resolved.endsWith("-reports") ||
    resolved === "reports" ||
    resolved === "accounts" ||
    resolved === "settings" ||
    resolved === "barcode-printing" ||
    resolved === "stock-report" ||
    resolved === "stock-adjustment" ||
    resolved === "stock-settlement" ||
    resolved === "stock-analysis" ||
    resolved === "stock-ageing"
  ) {
    return "dashboard";
  }
  // Remaining fullscreen modules (masters, commission, etc.)
  return "dashboard";
}
