import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
  "sale-return-dashboard": { label: "Sale Returns", icon: "ArrowLeftRight" },
  "purchase-entry": { label: "Purchase Entry", icon: "Package" },
  "purchase-bill-dashboard": { label: "Purchase Bills", icon: "Package" },
  "purchase-return-entry": { label: "Purchase Return", icon: "ArrowLeftRight" },
  "purchase-return-dashboard": { label: "Purchase Returns", icon: "ArrowLeftRight" },
  "product-entry": { label: "Product Entry", icon: "Tag" },
  "product-dashboard": { label: "Products", icon: "Layers" },
  "customers": { label: "Customers", icon: "Users" },
  "suppliers": { label: "Suppliers", icon: "Building2" },
  "employees": { label: "Employees", icon: "UserCheck" },
  "stock-report": { label: "Stock Report", icon: "BarChart3" },
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
  "delivery-dashboard": { label: "Delivery", icon: "Truck" },
  "barcode-printing": { label: "Barcode Print", icon: "Printer" },
  "settings": { label: "Settings", icon: "Settings" },
  "audit-log": { label: "Audit Log", icon: "History" },
  "user-rights": { label: "User Rights", icon: "UserCheck" },
};

const STORAGE_KEY = "smart_inventory_open_windows";
const VISIBILITY_KEY = "smart_inventory_tabs_visible";
const MAX_WINDOWS = 8;

export function WindowTabsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { orgSlug, getOrgPath } = useOrgNavigation();
  
  const [openWindows, setOpenWindows] = useState<WindowTab[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
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

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(openWindows));
  }, [openWindows]);

  // Update active window on location change and auto-add to tabs
  useEffect(() => {
    const currentPath = getCurrentPath();
    setActiveWindow(currentPath);
    
    // Auto-add current page to open windows if not already there
    if (currentPath && PAGE_CONFIG[currentPath]) {
      const config = PAGE_CONFIG[currentPath];
      const exists = openWindows.some(w => w.path === currentPath);
      if (!exists && openWindows.length < MAX_WINDOWS) {
        setOpenWindows(prev => [...prev, { path: currentPath, label: config.label, icon: config.icon }]);
      }
    }
  }, [location.pathname, getCurrentPath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab to cycle through windows
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (openWindows.length > 1) {
          const currentIndex = openWindows.findIndex(w => w.path === activeWindow);
          const nextIndex = e.shiftKey 
            ? (currentIndex - 1 + openWindows.length) % openWindows.length
            : (currentIndex + 1) % openWindows.length;
          const nextWindow = openWindows[nextIndex];
          navigate(getOrgPath(`/${nextWindow.path}`));
        }
      }
      
      // Ctrl+W to close current window (but not if only one window)
      if (e.ctrlKey && e.key === "w" && openWindows.length > 1) {
        e.preventDefault();
        closeWindow(activeWindow);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openWindows, activeWindow, navigate, getOrgPath]);

  const openWindow = useCallback((path: string) => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const config = PAGE_CONFIG[cleanPath];
    if (!config) return;

    const exists = openWindows.some(w => w.path === cleanPath);
    if (!exists && openWindows.length < MAX_WINDOWS) {
      setOpenWindows(prev => [...prev, { path: cleanPath, label: config.label, icon: config.icon }]);
    }
    navigate(getOrgPath(`/${cleanPath}`));
  }, [openWindows, navigate, getOrgPath]);

  const closeWindow = useCallback((path: string) => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const newWindows = openWindows.filter(w => w.path !== cleanPath);
    setOpenWindows(newWindows);
    
    // If closing active window, switch to previous or first window
    if (cleanPath === activeWindow && newWindows.length > 0) {
      const closedIndex = openWindows.findIndex(w => w.path === cleanPath);
      const nextWindow = newWindows[Math.max(0, closedIndex - 1)];
      navigate(getOrgPath(`/${nextWindow.path}`));
    }
  }, [openWindows, activeWindow, navigate, getOrgPath]);

  const switchWindow = useCallback((path: string) => {
    navigate(getOrgPath(`/${path}`));
  }, [navigate, getOrgPath]);

  const isWindowOpen = useCallback((path: string) => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
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
