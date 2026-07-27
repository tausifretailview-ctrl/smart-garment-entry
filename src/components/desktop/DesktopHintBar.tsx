import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getElectronAPI, isElectronShell } from "@/lib/electronShell";

/** Full-screen pages — no shortcut strip (POS / Sale Bill / Purchase / Stock Settlement). */
const NO_HINT_ROUTES = new Set([
  "pos-sales",
  "sales-invoice",
  "purchase-entry",
  "stock-settlement",
]);

const HINTS: Record<string, [string, string][]> = {
  "stock-report": [
    ["F2", "Search"],
    ["Ctrl+E", "Export"],
    ["Ctrl+P", "Print"],
    ["Esc", "Back"],
  ],
  "item-wise-sales": [
    ["F2", "Search"],
    ["Ctrl+E", "Export"],
    ["Esc", "Back"],
  ],
  dashboard: [
    ["Alt+N", "Sale"],
    ["Alt+B", "Purchase"],
    ["Alt+P", "POS"],
    ["Alt+S", "Stock"],
  ],
  accounts: [
    ["F2", "Search"],
    ["Ctrl+P", "Print"],
    ["Esc", "Back"],
  ],
  "daily-tally": [
    ["F2", "Search"],
    ["Ctrl+P", "Print"],
    ["Esc", "Back"],
  ],
  "customer-master": [
    ["F2", "Search"],
    ["Alt+N", "New"],
    ["Esc", "Back"],
  ],
  "supplier-master": [
    ["F2", "Search"],
    ["Alt+N", "New"],
    ["Esc", "Back"],
  ],
  "product-dashboard": [
    ["F2", "Search"],
    ["Alt+N", "New"],
    ["Esc", "Back"],
  ],
  "recycle-bin": [
    ["F2", "Search"],
    ["Esc", "Back"],
  ],
};

const DEFAULT_HINTS: [string, string][] = [
  ["F1", "Help"],
  ["F2", "Search"],
  ["Alt+N", "New Sale"],
  ["Alt+B", "Purchase"],
  ["Alt+P", "POS"],
  ["Esc", "Back"],
];

function routeKey(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  return segs[segs.length - 1] || "";
}

/**
 * Tally-style keyboard hint strip — Electron desktop only.
 * Replaces the former main-process DOM injection + 2s re-assert interval.
 * Viewport CSS vars stay in the shell inject (not here).
 */
export function DesktopHintBar() {
  const location = useLocation();
  const [online, setOnline] = useState(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
  );

  const key = routeKey(location.pathname);
  const hideHint = NO_HINT_ROUTES.has(key);
  const hints = useMemo(() => HINTS[key] || DEFAULT_HINTS, [key]);
  const appVersion = getElectronAPI()?.appVersion ?? "";

  useEffect(() => {
    if (!isElectronShell()) return;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isElectronShell()) return;
    const root = document.documentElement;
    const wantH = hideHint ? "0px" : "22px";
    if (root.style.getPropertyValue("--ezzy-hint-bar-height") !== wantH) {
      root.style.setProperty("--ezzy-hint-bar-height", wantH);
    }
  }, [hideHint]);

  if (!isElectronShell() || hideHint) return null;

  return (
    <div id="ezzy-hint-bar" aria-hidden="true">
      {hints.map(([accel, label]) => (
        <span key={`${accel}-${label}`} className="hint">
          <b>{accel}</b> {label}
        </span>
      ))}
      <span className="spacer" />
      <span className="meta">
        {online ? "● Online" : "○ Offline"}
        {appVersion ? ` · Desktop v${appVersion}` : ""}
      </span>
    </div>
  );
}
