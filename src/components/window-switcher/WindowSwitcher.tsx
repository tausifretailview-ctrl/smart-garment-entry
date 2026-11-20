import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getTabIcon, useWindowTabs } from "@/contexts/WindowTabsContext";
import {
  WINDOW_SWITCHER_KEY,
  initialSelection,
  lastUsedLabel,
  stepIndex,
  windowDetail,
  withCurrentFirst,
} from "@/lib/windowSwitcher";
import { resolveTabCachePath } from "@/lib/tabPageRegistry";
import { entryWindowId, tabIdOf } from "@/lib/entryWindows";
import "./window-switcher.css";

type Held = "Alt" | "Control" | null;

/** Colour pair per icon so each window is easy to spot. */
const PALETTE: Record<string, [string, string]> = {
  Home: ["#6366f1", "#8b5cf6"],
  ShoppingCart: ["#a855f7", "#ec4899"],
  FileText: ["#2563eb", "#7c3aed"],
  ClipboardList: ["#f97316", "#f59e0b"],
  Package: ["#059669", "#0891b2"],
  Layers: ["#8b5cf6", "#6366f1"],
  Users: ["#3b82f6", "#06b6d4"],
  Building2: ["#f59e0b", "#d97706"],
  Truck: ["#22c55e", "#0d9488"],
  UserCheck: ["#14b8a6", "#0ea5e9"],
  BarChart3: ["#0891b2", "#4f46e5"],
  CalendarDays: ["#e11d48", "#9333ea"],
  Wallet: ["#0d9488", "#22c55e"],
  BookOpen: ["#4f46e5", "#7c3aed"],
  Settings: ["#475569", "#1e293b"],
  Store: ["#ec4899", "#f97316"],
};

export function sketchKind(path: string): "bill" | "chart" | "list" {
  if (path === "sales-invoice" || /(-entry|pos-sales)$/.test(path)) return "bill";
  if (path === "" || /(report|analysis|dashboard|bills|summary|tally|insights|accounts|payments)/.test(path)) return "chart";
  return "list";
}

/** A tiny drawing of the kind of page (bill lines, chart, or list), so cards read at a glance. */
function Sketch({ kind }: { kind: "bill" | "chart" | "list" }) {
  if (kind === "chart") {
    const bars = [38, 62, 46, 80, 55, 92, 70];
    return (
      <div className="flex h-full items-end gap-1.5 px-3 pb-2.5 pt-4">
        {bars.map((h, i) => (
          <span key={i} className="wsw-bar flex-1 rounded-t-sm opacity-90" style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  }
  if (kind === "bill") {
    return (
      <div className="flex h-full flex-col gap-1.5 px-3 py-2.5">
        <span className="wsw-bar h-2 w-1/3 rounded-sm" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex gap-1.5">
            <span className="h-1.5 flex-[3] rounded-sm bg-slate-300" />
            <span className="h-1.5 flex-1 rounded-sm bg-slate-300" />
            <span className="h-1.5 flex-1 rounded-sm bg-slate-400/70" />
          </span>
        ))}
        <span className="mt-auto ml-auto h-2.5 w-1/4 rounded-sm bg-slate-500/70" />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1.5 px-3 py-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="wsw-bar h-2.5 w-2.5 rounded-full opacity-80" />
          <span className="h-1.5 flex-1 rounded-sm bg-slate-300" style={{ maxWidth: `${85 - i * 9}%` }} />
        </span>
      ))}
    </div>
  );
}

/** Window id of the page on screen ("sales-invoice~2" for Sale Bill 2), from the address. */
function addressWindowId(): string {
  const path = resolveTabCachePath(window.location.pathname.split("/").filter(Boolean).slice(1).join("/"));
  return entryWindowId(path, window.location.search);
}

/**
 * Alt+W window switcher, like Windows Alt+Tab, for the windows in the tab strip.
 *   Hold Alt, tap W to move (Shift+W back), release Alt to open the chosen window.
 *   Arrows / Tab move, Enter opens, Delete or the × closes a window, Esc cancels.
 *   Ctrl+Tab does the same in the Windows app (browsers keep Ctrl+Tab for their own tabs).
 * Opened from the tab strip button it stays open until a window is chosen or Esc.
 */
export function WindowSwitcher() {
  const { windowsByRecent, activeWindow, lastUsedAt, switchWindow, closeWindow, isSwitcherOpen, setSwitcherOpen } =
    useWindowTabs();
  const [selected, setSelected] = useState(0);
  const [visible, setVisible] = useState(false);
  const held = useRef<Held>(null);
  // The window on screen, read from the address (the tab state can be a render behind it).
  const currentPath = resolveTabCachePath(window.location.pathname.split("/").filter(Boolean).slice(1).join("/"));
  const currentId = entryWindowId(currentPath, window.location.search);
  const windows = withCurrentFirst(windowsByRecent, currentId);
  const count = windows.length;
  const listRef = useRef(windows);
  listRef.current = windows;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- "last used" is worked out when the switcher opens
  const now = useMemo(() => Date.now(), [isSwitcherOpen]);

  const close = useCallback(() => {
    held.current = null;
    setSwitcherOpen(false);
    setVisible(false);
  }, [setSwitcherOpen]);

  const commit = useCallback(
    (index?: number) => {
      const target = listRef.current[index ?? selectedRef.current];
      close();
      const here = addressWindowId();
      if (target && tabIdOf(target) !== here) switchWindow(tabIdOf(target));
    },
    [close, switchWindow],
  );

  const openSwitcher = useCallback(
    (by: Held) => {
      listRef.current = withCurrentFirst(listRef.current, addressWindowId());
      if (listRef.current.length === 0) return;
      held.current = by;
      setSelected(initialSelection(listRef.current.length));
      setSwitcherOpen(true);
    },
    [setSwitcherOpen],
  );

  // Show after a moment when opened with a held key, so a quick Alt+W tap just flips to the
  // last window without a flash. Opened from the tab strip button it shows at once.
  useEffect(() => {
    if (!isSwitcherOpen) return;
    if (held.current === null) {
      setSelected(initialSelection(listRef.current.length));
      setVisible(true);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 110);
    return () => window.clearTimeout(t);
  }, [isSwitcherOpen]);

  useEffect(() => {
    if (selected >= count && count > 0) setSelected(count - 1);
    if (isSwitcherOpen && count === 0) close();
  }, [count, selected, isSwitcherOpen, close]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const altW = e.altKey && !e.ctrlKey && !e.metaKey && (key === WINDOW_SWITCHER_KEY || e.code === "KeyW");
      const ctrlTab = e.ctrlKey && !e.altKey && e.key === "Tab";
      if (!isSwitcherOpen) {
        if (altW || ctrlTab) {
          e.preventDefault();
          e.stopPropagation();
          openSwitcher(altW ? "Alt" : "Control");
        }
        return;
      }
      // Switcher open: it owns the keyboard.
      const n = listRef.current.length;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      const move = (d: number) => {
        stop();
        setSelected((i) => stepIndex(i, d, n));
      };
      if (altW || ctrlTab || e.key === "Tab") return move(e.shiftKey ? -1 : 1);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") return move(1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") return move(-1);
      if (e.key === "Home") return move(-selectedRef.current);
      if (e.key === "End") return move(n - 1 - selectedRef.current);
      if (e.key === "Enter" || e.key === " ") {
        stop();
        commit();
        return;
      }
      if (e.key === "Escape") {
        stop();
        close();
        return;
      }
      if (e.key === "Delete" || (key === "x" && !e.ctrlKey && !e.altKey)) {
        stop();
        const target = listRef.current[selectedRef.current];
        if (target && n > 1) closeWindow(tabIdOf(target));
        return;
      }
      if (!["Alt", "Control", "Shift", "Meta"].includes(e.key)) stop();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isSwitcherOpen || !held.current) return;
      if (e.key === held.current) {
        // Releasing the held key opens the chosen window (and keeps the browser menu shut).
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
    };
    const onBlur = () => {
      if (isSwitcherOpen && held.current) close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [isSwitcherOpen, openSwitcher, commit, close, closeWindow]);

  if (!isSwitcherOpen || !visible || count === 0) return null;

  const kbd = "rounded bg-white/10 px-1.5 py-0.5 text-slate-200";

  return createPortal(
    <div
      className="wsw-root wsw-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Switch window"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="wsw-panel w-full max-w-5xl rounded-3xl px-5 pb-5 pt-4 sm:px-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
            Open windows <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">{count}</span>
          </h2>
          <p className="text-[11px] text-slate-400">
            <kbd className={kbd}>Alt</kbd> + <kbd className={kbd}>W</kbd> next · <kbd className={kbd}>Enter</kbd> open ·{" "}
            <kbd className={kbd}>Del</kbd> close · <kbd className={kbd}>Esc</kbd> cancel
          </p>
        </div>

        <ul className="wsw-stage flex flex-wrap justify-center gap-4" role="listbox" aria-label="Open windows">
          {windows.map((w, i) => {
            const Icon = getTabIcon(w.icon);
            const [from, to] = PALETTE[w.icon] ?? ["#6366f1", "#0ea5e9"];
            const isSel = i === selected;
            const wid = tabIdOf(w);
            const isActive = wid === currentId || (!currentPath && wid === activeWindow);
            const detail = windowDetail(w.path, w.search);
            const used = isActive ? "Current window" : lastUsedLabel(lastUsedAt[wid], now) || "Open";
            return (
              <li
                key={wid}
                role="option"
                aria-selected={isSel}
                className="wsw-card group relative w-[178px] cursor-pointer rounded-2xl p-2.5 sm:w-[196px]"
                data-selected={isSel ? "true" : "false"}
                data-side={i < selected ? "left" : i > selected ? "right" : "center"}
                style={{ "--wsw-from": from, "--wsw-to": to } as React.CSSProperties}
                onMouseEnter={() => setSelected(i)}
                onClick={() => commit(i)}
              >
                <div className="mb-2 flex items-center gap-2 pr-6">
                  <span className="wsw-glyph flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" aria-hidden="true">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-white">{w.label}</span>
                    <span className={isActive ? "block truncate text-[11px] font-medium text-emerald-300" : "block truncate text-[11px] text-slate-400"}>
                      {used}
                    </span>
                  </span>
                </div>
                <div className="wsw-sketch h-[92px] overflow-hidden rounded-xl sm:h-[104px]" aria-hidden="true">
                  <Sketch kind={sketchKind(w.path)} />
                </div>
                {detail ? <p className="mt-1.5 truncate text-[11px] text-indigo-200">{detail}</p> : null}
                {count > 1 ? (
                  <button
                    type="button"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-red-500/90 text-white opacity-0 transition-opacity hover:bg-red-500 focus:opacity-100 group-hover:opacity-100 data-[shown=true]:opacity-100"
                    data-shown={isSel ? "true" : "false"}
                    aria-label={`Close ${w.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeWindow(wid);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
