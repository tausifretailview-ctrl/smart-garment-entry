import { ReactNode, useEffect } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { OwnerBottomNav } from "@/components/mobile/OwnerBottomNav";
import { MobileFAB } from "@/components/mobile/MobileFAB";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { StatusBar } from "@/components/StatusBar";
import { useEscapeBack } from "@/hooks/useEscapeBack";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { initUIScale } from "@/components/UIScaleSelector";
import { DashboardScaleControl } from "@/components/dashboard/DashboardScaleControl";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");
  useEscapeBack();
  const { orgNavigate } = useOrgNavigation();
  const location = useLocation();
  // Full-screen billing: hide sidebar + header/tabs on Sales Invoice
  const isSalesInvoicePage = /\/sales-invoice(\/|$)/.test(location.pathname);
  const enterpriseScalePaths = [
    "/",
    "/products",
    "/purchase-bills",
    "/purchase-returns",
    "/purchase-orders",
    "/quotation-dashboard",
    "/sale-order-dashboard",
    "/sales-invoice-dashboard",
    "/sale-returns",
    "/delivery-challan-dashboard",
    "/advance-booking-dashboard",
    "/payments-dashboard",
    "/delivery-dashboard",
    "/stock-report",
    "/stock-ageing",
    "/stock-analysis",
    "/purchase-report",
    "/sales-report",
    "/product-tracking",
    "/daily-cashier-report",
    "/daily-tally",
    "/item-wise-sales",
    "/item-wise-stock",
    "/price-history",
    "/gst-reports",
    "/gst-register",
    "/tally-export",
    "/sales-analytics",
    "/accounting-reports",
    "/expense-salary-report",
    "/customer-ledger-report",
    "/customer-account-statement",
    "/customer-audit-report",
    "/daily-sale-analysis",
    "/einvoice-report",
    "/net-profit-analysis",
    "/hourly-sales-analysis",
    "/accounts",
    "/chart-of-accounts",
    "/audit-log",
  ];
  const isEnterpriseDashboardOrReport =
    enterpriseScalePaths.some((path) =>
      location.pathname === path || location.pathname.endsWith(path)
    ) &&
    !/\/(sales-invoice|purchase-entry|pos-sales|pos-dashboard)(\/|$)/.test(location.pathname);

  // Apply saved UI scale on mount
  useEffect(() => { initUIScale(); }, []);

  // Global Alt+key shortcuts for quick navigation
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "n": e.preventDefault(); orgNavigate("/sales-invoice"); break;
          case "p": e.preventDefault(); orgNavigate("/pos-sales"); break;
          case "b": e.preventDefault(); orgNavigate("/purchase-entry"); break;
          case "d": e.preventDefault(); orgNavigate("/"); break;
          case "s": e.preventDefault(); orgNavigate("/stock-report"); break;
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [orgNavigate]);

  return (
    <ChatProvider>
      <SidebarProvider defaultOpen={false}>
        {/* Mobile offline indicator */}
        <OfflineIndicator />
        
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            {!isSalesInvoicePage && (
              <>
                <Header />
                {/* WindowTabsBar hidden on mobile to prevent tooltip touch interference */}
                <div className="hidden lg:block">
                  <WindowTabsBar />
                </div>
                <div className="flex lg:hidden items-center gap-1 px-2 py-0.5 border-b bg-sidebar">
                  <SidebarTrigger className="text-sidebar-foreground h-5 w-5" />
                </div>
              </>
            )}
            {/* Add bottom padding on mobile for bottom nav; lg adds extra for status bar */}
            <main
              className={
                isSalesInvoicePage
                  ? "flex-1 overflow-hidden relative z-[1] min-h-0"
                  : `flex-1 overflow-auto pb-20 lg:pb-14 relative z-[1]${
                      isEnterpriseDashboardOrReport ? "" : " p-4"
                    }`
              }
            >
              {isEnterpriseDashboardOrReport ? (
                <div className="w-full px-4 py-4 space-y-4 bg-background min-h-full dashboard-readable">
                  <div className="flex justify-end">
                    <DashboardScaleControl />
                  </div>
                  {children}
                </div>
              ) : (
                children
              )}
            </main>
          </SidebarInset>
        </div>
        
        {/* Mobile navigation */}
        <OwnerBottomNav />
        <MobileFAB />
        
        <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
        <FloatingWhatsAppInbox />
        <FloatingChatButton />
        <StatusBar />
      </SidebarProvider>
    </ChatProvider>
  );
};
