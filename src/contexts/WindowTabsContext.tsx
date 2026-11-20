import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getMenuPermissionForPath, resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { prefetchTabPage, resolveTabCachePath } from "@/lib/tabPageRegistry";
import { PAGE_TITLE_CONFIG } from "@/lib/pageTitles";
import { isEditableTarget } from "@/lib/keyboardShortcuts";
import { orderByRecent, touchRecent } from "@/lib/windowSwitcher";
import {
  entryWindowId,
  entryWindowLabel,
  entryWindowSearch,
  forgetEntryWindowBill,
  isMultiWindowPage,
  markEntryWindowClosing,
  nextFreeEntryWindow,
  parseEntryWindowId,
  tabIdOf,
} from "@/lib/entryWindows";
import { 
  ShoppingCart, BarChart3, FileText, Users, Package, Settings, 
  Home, Truck, Receipt, ArrowLeftRight, ClipboardList, UserCheck,
  Building2, Layers, Tag, PieChart, Wallet, BookOpen, CalendarDays,
  FileSpreadsheet, History, TrendingUp, Printer, Store
} from "lucide-react";

interface WindowTab {
  /**
   * Window id: the path, or "path~N" for extra windows of a multi-window page (Sale Bill 2).
   * Missing on records saved before windows had ids (then the path is the id).
   */
  id?: string;
  path: string;
  label: string;
  icon: string;
  /** Last query string for this window tab (e.g. ?tab=customer-ledger&customer=uuid). */
  search?: string;
}

interface WindowTabsContextType {
  openWindows: WindowTab[];
  activeWindow: string;
  isTabsBarVisible: boolean;
  toggleTabsBarVisibility: () => void;
  /** Paths or window ids ("sales-invoice~2") are accepted by the window actions below. */
  openWindow: (path: string) => void;
  /** Open one more window of a multi-window page (Sale Bill 2, 3); false when all are open. */
  openNewWindow: (path: string) => boolean;
  closeWindow: (path: string) => void;
  switchWindow: (path: string) => void;
  /** Any window of this page is open. */
  isWindowOpen: (path: string) => boolean;
  /** Tab immediately before `fromPath` in the window strip (restores saved search on switch). */
  getPreviousWindow: (fromPath?: string) => WindowTab | null;
  /** Switch to the previous window tab; returns false when none is available. */
  switchToPreviousWindow: (fromPath?: string) => boolean;
  /** Open windows, most recently used first (window switcher, Alt+W). */
  windowsByRecent: WindowTab[];
  /** When each window was last in front (ms since epoch). */
  lastUsedAt: Record<string, number>;
  /** Window switcher overlay (Alt+W / Ctrl+Tab). */
  isSwitcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;
}

const WindowTabsContext = createContext<WindowTabsContextType | undefined>(undefined);

/** Inert value used when a consumer renders outside the provider, so the app degrades instead of blanking. */
const FALLBACK_WINDOW_TABS: WindowTabsContextType = {
  openWindows: [],
  activeWindow: "",
  isTabsBarVisible: false,
  toggleTabsBarVisibility: () => {},
  openWindow: () => {},
  openNewWindow: () => false,
  closeWindow: () => {},
  switchWindow: () => {},
  isWindowOpen: () => false,
  getPreviousWindow: () => null,
  switchToPreviousWindow: () => false,
  windowsByRecent: [],
  lastUsedAt: {},
  isSwitcherOpen: false,
  setSwitcherOpen: () => {},
};

/** Shared with document.title via pageTitles.ts */
const PAGE_CONFIG = PAGE_TITLE_CONFIG;

const STORAGE_KEY = "smart_inventory_open_windows";
const VISIBILITY_KEY = "smart_inventory_tabs_visible";
const MAX_WINDOWS = 8;

function normalizeWindowTab(tab: WindowTab): WindowTab {
  const canonical = resolveTabCachePath(tab.path);
  if (canonical === tab.path) return tab;
  return { ...tab, path: canonical, id: tab.id && tab.id !== tab.path ? tab.id.replace(tab.path, canonical) : undefined };
}

function normalizeWindowTabs(tabs: unknown): WindowTab[] {
  if (!Array.isArray(tabs)) return [];
  const seen = new Set<string>();
  const out: WindowTab[] = [];
  for (const tab of tabs) {
    if (!tab || typeof tab !== "object" || typeof (tab as WindowTab).path !== "string") continue;
    const normalized = normalizeWindowTab(tab as WindowTab);
    const id = tabIdOf(normalized);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(normalized);
  }
  return out;
}

/** Path part of a path or window id, canonical. */
function cleanWindowRef(ref: string): { id: string; path: string; instance: number } {
  const raw = ref.startsWith("/") ? ref.slice(1) : ref;
  const { path, instance } = parseEntryWindowId(raw);
  const canonical = resolveTabCachePath(path);
  return { id: instance > 1 ? `${canonical}~${instance}` : canonical, path: canonical, instance };
}

export function WindowTabsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { orgSlug, getOrgPath } = useOrgNavigation();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const { organizationRole } = useOrganization();
  
  const [openWindows, setOpenWindows] = useState<WindowTab[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeWindowTabs(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });

  const [isTabsBarVisible, setIsTabsBarVisible] = useState(() => {
    try {
      const saved = localStorage.getItem(VISIBILITY_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const toggleTabsBarVisibility = useCallback(() => {
    setIsTabsBarVisible((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // Get current path without org slug
  const getCurrentPath = useCallback(() => {
    const fullPath = location.pathname;
    if (orgSlug && fullPath.startsWith(`/${orgSlug}`)) {
      return fullPath.slice(orgSlug.length + 2) || "";
    }
    return fullPath.slice(1);
  }, [location.pathname, orgSlug]);

  const [activeWindow, setActiveWindow] = useState(getCurrentPath());
  // Most-recently-used order and last-use times for the window switcher (this tab only).
  const [recentOrder, setRecentOrder] = useState<string[]>([]);
  const [lastUsedAt, setLastUsedAt] = useState<Record<string, number>>({});
  const [isSwitcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    if (!activeWindow && activeWindow !== "") return;
    setRecentOrder((prev) => touchRecent(prev, activeWindow));
    setLastUsedAt((prev) => ({ ...prev, [activeWindow]: Date.now() }));
  }, [activeWindow]);

  const canAccessPath = useCallback((path: string) => {
    if (permissionsLoading && permissions === null) return false;
    const permission = getMenuPermissionForPath(path);
    return !permission || permissions === null || hasMenuAccess(permission);
  }, [hasMenuAccess, permissions, permissionsLoading]);

  const navigateToWindowPath = useCallback(
    (ref: string, windows: WindowTab[] = openWindows) => {
      const safeWindows = Array.isArray(windows) ? windows : [];
      const { id, path: cleanPath, instance } = cleanWindowRef(ref);
      let savedSearch = safeWindows.find((w) => tabIdOf(w) === id)?.search || "";
      // Extra windows of a page always carry their window number (?w=2).
      if (instance > 1 && entryWindowId(cleanPath, savedSearch) !== id) savedSearch = entryWindowSearch(instance);
      if (instance === 1 && isMultiWindowPage(cleanPath) && entryWindowId(cleanPath, savedSearch) !== cleanPath) savedSearch = "";
      // Safety net: never reopen the POS Sales tab on an old saved-invoice edit URL.
      // Strip ?saleId so clicking the POS Sales tab always lands on a fresh new sale.
      if (cleanPath === "pos-sales" && savedSearch) {
        try {
          const sp = new URLSearchParams(savedSearch.startsWith("?") ? savedSearch.slice(1) : savedSearch);
          if (sp.has("saleId")) {
            sp.delete("saleId");
            const remaining = sp.toString();
            savedSearch = remaining ? `?${remaining}` : "";
          }
        } catch {
          // ignore malformed search
        }
      }
      navigate(getOrgPath(`/${cleanPath}`) + savedSearch);
    },
    [navigate, getOrgPath, openWindows],
  );

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(openWindows));
  }, [openWindows]);

  useEffect(() => {
    if (permissionsLoading) return;
    setOpenWindows(prev => {
      if (!Array.isArray(prev)) return [];
      const allowed = prev.filter(w => canAccessPath(w.path));
      return allowed.length === prev.length ? prev : allowed;
    });
  }, [permissionsLoading, canAccessPath]);

  // Redirect away from main dashboard when user lacks main_dashboard right
  useEffect(() => {
    if (permissionsLoading) return;
    const currentPath = getCurrentPath();
    if (currentPath !== "" && currentPath !== "dashboard") return;
    if (canAccessPath("")) return;

    const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
    if (fallback !== currentPath) {
      navigate(getOrgPath(fallback ? `/${fallback}` : "/"));
    }
  }, [
    permissionsLoading,
    location.pathname,
    getCurrentPath,
    canAccessPath,
    hasMenuAccess,
    permissions,
    organizationRole,
    navigate,
    getOrgPath,
  ]);

  // Update active window on location change, persist query string per tab, auto-add to tabs
  useEffect(() => {
    const rawPath = getCurrentPath();
    const currentPath = resolveTabCachePath(rawPath);

    // Legacy tab-bar URLs (e.g. purchase-bill-dashboard) → canonical App route
    if (rawPath !== currentPath && PAGE_CONFIG[currentPath]) {
      const savedSearch = location.search || undefined;
      navigate(getOrgPath(`/${currentPath}`) + (savedSearch ?? ""), { replace: true });
      return;
    }

    const currentId = entryWindowId(currentPath, location.search);
    setActiveWindow(currentId);

    // Warm main dashboard chunk while user is on POS so first return is instant.
    if (currentPath === "pos-sales") {
      prefetchTabPage("");
    }
    
    // Auto-add current page to open windows if not already there; keep each tab's last ?query
    if (currentPath && PAGE_CONFIG[currentPath] && canAccessPath(currentPath)) {
      const config = PAGE_CONFIG[currentPath];
      const currentSearch = location.search || undefined;
      const instance = parseEntryWindowId(currentId).instance;
      setOpenWindows((prev) => {
        if (!Array.isArray(prev)) return [];
        const exists = prev.some((w) => tabIdOf(w) === currentId);
        if (!exists && prev.length < MAX_WINDOWS) {
          return [
            ...prev,
            {
              ...(instance > 1 ? { id: currentId } : {}),
              path: currentPath,
              label: entryWindowLabel(config.label, instance),
              icon: config.icon,
              search: currentSearch,
            },
          ];
        }
        if (!exists) return prev;
        let changed = false;
        const next = prev.map((w) => {
          if (tabIdOf(w) !== currentId) return w;
          if (w.search === currentSearch) return w;
          changed = true;
          return { ...w, search: currentSearch };
        });
        return changed ? next : prev;
      });
    }
  }, [location.pathname, location.search, getCurrentPath, canAccessPath, navigate, getOrgPath]);

  // Keyboard shortcuts — never while typing (barcode / form fields).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const allowedWindows = Array.isArray(openWindows)
        ? openWindows.filter(w => canAccessPath(w.path))
        : [];
      // Ctrl+Tab (Windows app; browsers keep Ctrl+Tab for their own tabs) is handled by the
      // window switcher, like Alt+W: hold Ctrl and tap Tab to move, release to open.
      
      // Ctrl+W to close current window (but not if only one window)
      if (e.ctrlKey && e.key === "w" && allowedWindows.length > 1) {
        e.preventDefault();
        closeWindow(activeWindow);
      }

      // Ctrl+1..9 to jump directly to the Nth open tab.
      // Requires Ctrl so it never collides with bare-number keys on other
      // screens (e.g. Purchase Entry's bare "1").
      if (e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < allowedWindows.length) {
          e.preventDefault();
          navigateToWindowPath(tabIdOf(allowedWindows[idx]), allowedWindows);
        }
      }

    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // openWindow/closeWindow are intentionally omitted: they are declared
    // after this effect and are recreated whenever openWindows changes (which
    // is already a dependency), so the handler always sees a fresh closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWindows, activeWindow, navigate, getOrgPath, canAccessPath]);

  const openWindow = useCallback((path: string) => {
    const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
    const config = PAGE_CONFIG[cleanPath];
    if (!config || !canAccessPath(cleanPath)) return;

    // Explicit user open — intent (must not be skipped on Save-Data / 2g).
    prefetchTabPage(cleanPath, { intent: true });
    const existing = Array.isArray(openWindows)
      ? openWindows.find((w) => tabIdOf(w) === cleanPath)
      : undefined;
    if (!existing && Array.isArray(openWindows) && openWindows.length < MAX_WINDOWS) {
      setOpenWindows((prev) => [
        ...prev,
        { path: cleanPath, label: config.label, icon: config.icon },
      ]);
    }
    navigateToWindowPath(cleanPath);
  }, [openWindows, navigateToWindowPath, canAccessPath]);

  const openNewWindow = useCallback((path: string) => {
    const { path: cleanPath } = cleanWindowRef(path);
    const config = PAGE_CONFIG[cleanPath];
    if (!config || !canAccessPath(cleanPath) || !isMultiWindowPage(cleanPath)) return false;
    const windows = Array.isArray(openWindows) ? openWindows : [];
    const instance = nextFreeEntryWindow(cleanPath, windows.map(tabIdOf));
    if (instance === null || windows.length >= MAX_WINDOWS) return false;
    prefetchTabPage(cleanPath, { intent: true });
    const id = instance > 1 ? `${cleanPath}~${instance}` : cleanPath;
    const search = entryWindowSearch(instance) || undefined;
    const next = [
      ...windows,
      { ...(instance > 1 ? { id } : {}), path: cleanPath, label: entryWindowLabel(config.label, instance), icon: config.icon, search },
    ];
    setOpenWindows(next);
    navigateToWindowPath(id, next);
    return true;
  }, [openWindows, navigateToWindowPath, canAccessPath]);

  const closeWindow = useCallback((ref: string) => {
    const { id, path: cleanPath, instance } = cleanWindowRef(ref);
    if (!Array.isArray(openWindows)) {
      setOpenWindows([]);
      return;
    }
    const newWindows = openWindows.filter(w => tabIdOf(w) !== id);
    setOpenWindows(newWindows);
    if (instance > 1) {
      // A closed extra window takes its unsaved bill with it (window 1 keeps its draft).
      markEntryWindowClosing(id);
      forgetEntryWindowBill(cleanPath, instance);
    }

    // If closing active window, switch to previous or first window
    if (id === activeWindow && newWindows.length > 0) {
      const closedIndex = openWindows.findIndex(w => tabIdOf(w) === id);
      const nextWindow = newWindows[Math.max(0, closedIndex - 1)];
      navigateToWindowPath(tabIdOf(nextWindow), newWindows);
    }
  }, [openWindows, activeWindow, navigateToWindowPath]);

  const switchWindow = useCallback((ref: string) => {
    const { id, path: cleanPath } = cleanWindowRef(ref);
    if (!canAccessPath(cleanPath)) return;
    prefetchTabPage(cleanPath, { intent: true });
    navigateToWindowPath(id);
  }, [navigateToWindowPath, canAccessPath]);

  const isWindowOpen = useCallback((ref: string) => {
    const { path: cleanPath } = cleanWindowRef(ref);
    return Array.isArray(openWindows) && openWindows.some(w => w.path === cleanPath);
  }, [openWindows]);

  const getPreviousWindow = useCallback(
    (fromRef?: string) => {
      if (!Array.isArray(openWindows) || openWindows.length === 0) return null;
      const current = cleanWindowRef(fromRef ?? activeWindow).id;
      const idx = openWindows.findIndex((w) => tabIdOf(w) === current);
      if (idx > 0) return openWindows[idx - 1];
      return openWindows.find((w) => tabIdOf(w) !== current) ?? null;
    },
    [openWindows, activeWindow],
  );

  const switchToPreviousWindow = useCallback(
    (fromRef?: string) => {
      const previous = getPreviousWindow(fromRef);
      if (!previous) return false;
      switchWindow(tabIdOf(previous));
      return true;
    },
    [getPreviousWindow, switchWindow],
  );

  const windowsByRecent = React.useMemo(
    () => orderByRecent((Array.isArray(openWindows) ? openWindows : []).filter((w) => canAccessPath(w.path)), recentOrder),
    [openWindows, recentOrder, canAccessPath],
  );

  return (
    <WindowTabsContext.Provider value={{
      openWindows,
      activeWindow,
      isTabsBarVisible,
      toggleTabsBarVisibility,
      openWindow,
      openNewWindow,
      closeWindow,
      switchWindow,
      isWindowOpen,
      getPreviousWindow,
      switchToPreviousWindow,
      windowsByRecent,
      lastUsedAt,
      isSwitcherOpen,
      setSwitcherOpen,
    }}>
      {children}
    </WindowTabsContext.Provider>
  );
}

export function useWindowTabs() {
  const context = useContext(WindowTabsContext);
  if (!context) {
    // Never crash the whole app (e.g. a stale HMR module instance in dev, or a
    // consumer rendered outside the provider) — degrade to an inert tab strip.
    if (import.meta.env.DEV) {
      console.warn("[WindowTabs] useWindowTabs called outside WindowTabsProvider — using inert fallback.");
    }
    return FALLBACK_WINDOW_TABS;
  }
  return context;
}

// Icon component mapper
export const getTabIcon = (iconName: string) => {
  const icons: Record<string, any> = {
    Home, ShoppingCart, BarChart3, FileText, Users, Package, Settings,
    Truck, Receipt, ArrowLeftRight, ClipboardList, UserCheck, Building2,
    Layers, Tag, PieChart, Wallet, BookOpen, CalendarDays, FileSpreadsheet,
    History, TrendingUp, Printer, Store
  };
  return icons[iconName] || FileText;
};
