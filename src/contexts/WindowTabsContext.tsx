import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getMenuPermissionForPath, resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { prefetchTabPage, resolveTabCachePath } from "@/lib/tabPageRegistry";
import { PAGE_TITLE_CONFIG } from "@/lib/pageTitles";
import { isEditableTarget } from "@/lib/keyboardShortcuts";
import { 
  ShoppingCart, BarChart3, FileText, Users, Package, Settings, 
  Home, Truck, Receipt, ArrowLeftRight, ClipboardList, UserCheck,
  Building2, Layers, Tag, PieChart, Wallet, BookOpen, CalendarDays,
  FileSpreadsheet, History, TrendingUp, Printer, Store
} from "lucide-react";

interface WindowTab {
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
  openWindow: (path: string) => void;
  closeWindow: (path: string) => void;
  switchWindow: (path: string) => void;
  isWindowOpen: (path: string) => boolean;
  /** Tab immediately before `fromPath` in the window strip (restores saved search on switch). */
  getPreviousWindow: (fromPath?: string) => WindowTab | null;
  /** Switch to the previous window tab; returns false when none is available. */
  switchToPreviousWindow: (fromPath?: string) => boolean;
}

const WindowTabsContext = createContext<WindowTabsContextType | undefined>(undefined);

/** Inert value used when a consumer renders outside the provider, so the app degrades instead of blanking. */
const FALLBACK_WINDOW_TABS: WindowTabsContextType = {
  openWindows: [],
  activeWindow: "",
  isTabsBarVisible: false,
  toggleTabsBarVisibility: () => {},
  openWindow: () => {},
  closeWindow: () => {},
  switchWindow: () => {},
  isWindowOpen: () => false,
  getPreviousWindow: () => null,
  switchToPreviousWindow: () => false,
};

/** Shared with document.title via pageTitles.ts */
const PAGE_CONFIG = PAGE_TITLE_CONFIG;

const STORAGE_KEY = "smart_inventory_open_windows";
const VISIBILITY_KEY = "smart_inventory_tabs_visible";
const MAX_WINDOWS = 8;

function normalizeWindowTab(tab: WindowTab): WindowTab {
  const canonical = resolveTabCachePath(tab.path);
  if (canonical === tab.path) return tab;
  return { ...tab, path: canonical };
}

function normalizeWindowTabs(tabs: unknown): WindowTab[] {
  if (!Array.isArray(tabs)) return [];
  const seen = new Set<string>();
  const out: WindowTab[] = [];
  for (const tab of tabs) {
    if (!tab || typeof tab !== "object" || typeof (tab as WindowTab).path !== "string") continue;
    const normalized = normalizeWindowTab(tab as WindowTab);
    if (seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    out.push(normalized);
  }
  return out;
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

  const canAccessPath = useCallback((path: string) => {
    if (permissionsLoading && permissions === null) return false;
    const permission = getMenuPermissionForPath(path);
    return !permission || permissions === null || hasMenuAccess(permission);
  }, [hasMenuAccess, permissions, permissionsLoading]);

  const navigateToWindowPath = useCallback(
    (path: string, windows: WindowTab[] = openWindows) => {
      const safeWindows = Array.isArray(windows) ? windows : [];
      const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
      let savedSearch = safeWindows.find((w) => w.path === cleanPath)?.search || "";
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

    setActiveWindow(currentPath);

    // Warm main dashboard chunk while user is on POS so first return is instant.
    if (currentPath === "pos-sales") {
      prefetchTabPage("");
    }
    
    // Auto-add current page to open windows if not already there; keep each tab's last ?query
    if (currentPath && PAGE_CONFIG[currentPath] && canAccessPath(currentPath)) {
      const config = PAGE_CONFIG[currentPath];
      const currentSearch = location.search || undefined;
      setOpenWindows((prev) => {
        if (!Array.isArray(prev)) return [];
        const exists = prev.some((w) => w.path === currentPath);
        if (!exists && prev.length < MAX_WINDOWS) {
          return [
            ...prev,
            { path: currentPath, label: config.label, icon: config.icon, search: currentSearch },
          ];
        }
        if (!exists) return prev;
        let changed = false;
        const next = prev.map((w) => {
          if (w.path !== currentPath) return w;
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
      // Ctrl+Tab to cycle through windows
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (allowedWindows.length > 1) {
          const currentIndex = allowedWindows.findIndex(w => w.path === activeWindow);
          const nextIndex = e.shiftKey 
            ? (currentIndex - 1 + allowedWindows.length) % allowedWindows.length
            : (currentIndex + 1) % allowedWindows.length;
          const nextWindow = allowedWindows[nextIndex];
          navigateToWindowPath(nextWindow.path, allowedWindows);
        }
      }
      
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
          navigateToWindowPath(allowedWindows[idx].path, allowedWindows);
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
      ? openWindows.find((w) => w.path === cleanPath)
      : undefined;
    if (!existing && Array.isArray(openWindows) && openWindows.length < MAX_WINDOWS) {
      setOpenWindows((prev) => [
        ...prev,
        { path: cleanPath, label: config.label, icon: config.icon },
      ]);
    }
    navigateToWindowPath(cleanPath);
  }, [openWindows, navigateToWindowPath, canAccessPath]);

  const closeWindow = useCallback((path: string) => {
    const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
    if (!Array.isArray(openWindows)) {
      setOpenWindows([]);
      return;
    }
    const newWindows = openWindows.filter(w => w.path !== cleanPath);
    setOpenWindows(newWindows);
    
    // If closing active window, switch to previous or first window
    if (cleanPath === activeWindow && newWindows.length > 0) {
      const closedIndex = openWindows.findIndex(w => w.path === cleanPath);
      const nextWindow = newWindows[Math.max(0, closedIndex - 1)];
      navigateToWindowPath(nextWindow.path, newWindows);
    }
  }, [openWindows, activeWindow, navigateToWindowPath]);

  const switchWindow = useCallback((path: string) => {
    const cleanPath = resolveTabCachePath(path);
    if (!canAccessPath(cleanPath)) return;
    prefetchTabPage(cleanPath, { intent: true });
    navigateToWindowPath(cleanPath);
  }, [navigateToWindowPath, canAccessPath]);

  const isWindowOpen = useCallback((path: string) => {
    const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
    return Array.isArray(openWindows) && openWindows.some(w => w.path === cleanPath);
  }, [openWindows]);

  const getPreviousWindow = useCallback(
    (fromPath?: string) => {
      if (!Array.isArray(openWindows) || openWindows.length === 0) return null;
      const current = resolveTabCachePath(fromPath ?? activeWindow);
      const idx = openWindows.findIndex((w) => w.path === current);
      if (idx > 0) return openWindows[idx - 1];
      return openWindows.find((w) => w.path !== current) ?? null;
    },
    [openWindows, activeWindow],
  );

  const switchToPreviousWindow = useCallback(
    (fromPath?: string) => {
      const previous = getPreviousWindow(fromPath);
      if (!previous) return false;
      switchWindow(previous.path);
      return true;
    },
    [getPreviousWindow, switchWindow],
  );

  return (
    <WindowTabsContext.Provider value={{
      openWindows,
      activeWindow,
      isTabsBarVisible,
      toggleTabsBarVisibility,
      openWindow,
      closeWindow,
      switchWindow,
      isWindowOpen,
      getPreviousWindow,
      switchToPreviousWindow,
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
