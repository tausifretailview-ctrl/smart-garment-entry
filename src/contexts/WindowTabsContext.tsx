import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getMenuPermissionForPath, resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { prefetchTabPage, resolveTabCachePath } from "@/lib/tabPageRegistry";
import { 
  ShoppingCart, BarChart3, FileText, Users, Package, Settings, 
  Home, Truck, Receipt, ArrowLeftRight, ClipboardList, UserCheck,
  Building2, Layers, Tag, PieChart, Wallet, BookOpen, CalendarDays,
  FileSpreadsheet, History, TrendingUp, Printer
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
}

const WindowTabsContext = createContext<WindowTabsContextType | undefined>(undefined);

// Map routes to friendly names and icons
const PAGE_CONFIG: Record<string, { label: string; icon: string }> = {
  "": { label: "Dashboard", icon: "Home" },
  "dashboard": { label: "Dashboard", icon: "Home" },
  "pos-sales": { label: "POS Sales", icon: "ShoppingCart" },
  "pos-dashboard": { label: "POS Dashboard", icon: "Receipt" },
  "sales-invoice": { label: "Sales Invoice", icon: "FileText" },
  "sales-invoice-dashboard": { label: "Sales Dashboard", icon: "FileText" },
  "quotation-entry": { label: "Quotation", icon: "ClipboardList" },
  "quotation-dashboard": { label: "Quotations", icon: "ClipboardList" },
  "sale-order-entry": { label: "Sale Order", icon: "ClipboardList" },
  "sale-order-dashboard": { label: "Sale Orders", icon: "ClipboardList" },
  "sale-return-entry": { label: "Sale Return", icon: "ArrowLeftRight" },
  "sale-returns": { label: "Sale Returns", icon: "ArrowLeftRight" },
  "sale-return-dashboard": { label: "Sale Returns", icon: "ArrowLeftRight" },
  "purchase-entry": { label: "Purchase Entry", icon: "Package" },
  "purchase-bill-dashboard": { label: "Purchase Bills", icon: "Package" },
  "purchase-bills": { label: "Purchase Bills", icon: "Package" },
  "purchase-return-entry": { label: "Purchase Return", icon: "ArrowLeftRight" },
  "purchase-return-dashboard": { label: "Purchase Returns", icon: "ArrowLeftRight" },
  "purchase-returns": { label: "Purchase Returns", icon: "ArrowLeftRight" },
  "product-entry": { label: "Product Entry", icon: "Tag" },
  "product-dashboard": { label: "Products", icon: "Layers" },
  "products": { label: "Products", icon: "Layers" },
  "customers": { label: "Customers", icon: "Users" },
  "suppliers": { label: "Suppliers", icon: "Building2" },
  "employees": { label: "Employees", icon: "UserCheck" },
  "stock-report": { label: "Stock Report", icon: "BarChart3" },
  reports: { label: "Reports Hub", icon: "BarChart3" },
  "item-wise-sales": { label: "Item Sales", icon: "PieChart" },
  "sales-report-by-customer": { label: "Customer Sales", icon: "TrendingUp" },
  "purchase-report-by-supplier": { label: "Supplier Report", icon: "TrendingUp" },
  "price-history": { label: "Price History", icon: "History" },
  "product-tracking": { label: "Product Tracking", icon: "History" },
  "daily-cashier-report": { label: "Daily Cashier", icon: "CalendarDays" },
  "gst-register": { label: "GST Register", icon: "FileSpreadsheet" },
  "tally-export": { label: "Tally Export", icon: "FileSpreadsheet" },
  "payments-dashboard": { label: "Payments", icon: "Wallet" },
  "accounts": { label: "Accounts", icon: "BookOpen" },
  "chart-of-accounts": { label: "Chart of Accounts", icon: "BookOpen" },
  "journal-vouchers": { label: "Journal Vouchers", icon: "BookOpen" },
  "manual-journal": { label: "Manual Journal", icon: "BookOpen" },
  "ledger-opening-balances": { label: "Opening Balances", icon: "BookOpen" },
  "purchase-orders": { label: "Purchase Orders", icon: "ClipboardList" },
  "delivery-dashboard": { label: "Delivery", icon: "Truck" },
  "barcode-printing": { label: "Barcode Print", icon: "Printer" },
  "settings": { label: "Settings", icon: "Settings" },
  "audit-log": { label: "Audit Log", icon: "History" },
  "user-rights": { label: "User Rights", icon: "UserCheck" },
};

const STORAGE_KEY = "smart_inventory_open_windows";
const VISIBILITY_KEY = "smart_inventory_tabs_visible";
const MAX_WINDOWS = 8;

function normalizeWindowTab(tab: WindowTab): WindowTab {
  const canonical = resolveTabCachePath(tab.path);
  if (canonical === tab.path) return tab;
  return { ...tab, path: canonical };
}

function normalizeWindowTabs(tabs: WindowTab[]): WindowTab[] {
  const seen = new Set<string>();
  const out: WindowTab[] = [];
  for (const tab of tabs) {
    const normalized = normalizeWindowTab(tab);
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
      const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
      let savedSearch = windows.find((w) => w.path === cleanPath)?.search || "";
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const allowedWindows = openWindows.filter(w => canAccessPath(w.path));
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

    prefetchTabPage(cleanPath);
    const existing = openWindows.find((w) => w.path === cleanPath);
    if (!existing && openWindows.length < MAX_WINDOWS) {
      setOpenWindows((prev) => [
        ...prev,
        { path: cleanPath, label: config.label, icon: config.icon },
      ]);
    }
    navigateToWindowPath(cleanPath);
  }, [openWindows, navigateToWindowPath, canAccessPath]);

  const closeWindow = useCallback((path: string) => {
    const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
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
    prefetchTabPage(cleanPath);
    navigateToWindowPath(cleanPath);
  }, [navigateToWindowPath, canAccessPath]);

  const isWindowOpen = useCallback((path: string) => {
    const cleanPath = resolveTabCachePath(path.startsWith("/") ? path.slice(1) : path);
    return openWindows.some(w => w.path === cleanPath);
  }, [openWindows]);

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
    }}>
      {children}
    </WindowTabsContext.Provider>
  );
}

export function useWindowTabs() {
  const context = useContext(WindowTabsContext);
  if (!context) {
    throw new Error("useWindowTabs must be used within WindowTabsProvider");
  }
  return context;
}

// Icon component mapper
export const getTabIcon = (iconName: string) => {
  const icons: Record<string, any> = {
    Home, ShoppingCart, BarChart3, FileText, Users, Package, Settings,
    Truck, Receipt, ArrowLeftRight, ClipboardList, UserCheck, Building2,
    Layers, Tag, PieChart, Wallet, BookOpen, CalendarDays, FileSpreadsheet,
    History, TrendingUp, Printer
  };
  return icons[iconName] || FileText;
};
