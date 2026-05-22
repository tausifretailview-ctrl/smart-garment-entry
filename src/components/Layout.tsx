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
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { MobileScanProvider } from "@/contexts/MobileScanContext";
import { StatusBar } from "@/components/StatusBar";
import { useEscapeBack } from "@/hooks/useEscapeBack";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { initUIScale } from "@/components/UIScaleSelector";
import { useLocation } from "react-router-dom";
import { DashboardToolbarProvider } from "@/contexts/DashboardToolbarContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");
  useEscapeBack();
  const { orgNavigate } = useOrgNavigation();
  const location = useLocation();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const { organizationRole } = useOrganization();
  // Full-screen billing: hide sidebar + header/tabs on Sales Invoice
  const isSalesInvoicePage = /\/sales-invoice(\/|$)/.test(location.pathname);

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
          case "d": {
            e.preventDefault();
            if (permissionsLoading) break;
            const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
            orgNavigate(fallback ? `/${fallback}` : "/");
            break;
          }
          case "s": e.preventDefault(); orgNavigate("/stock-report"); break;
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [orgNavigate]);

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
      <MobileScanProvider>
      <SidebarProvider defaultOpen={false}>
        {/* Mobile offline indicator */}
        <OfflineIndicator />
        
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            {!isSalesInvoicePage && (
              <>
                <div className="hidden lg:block">
                  <Header />
                  <WindowTabsBar />
                </div>
                <div className="flex lg:hidden items-center gap-2 px-3 py-2 border-b bg-sidebar shrink-0">
                  <SidebarTrigger className="text-sidebar-foreground h-8 w-8 touch-manipulation" />
                  <span className="text-sm font-semibold text-sidebar-foreground truncate flex-1">
                    Menu
                  </span>
                </div>
              </>
            )}
            {/* Add bottom padding on mobile for bottom nav; lg adds extra for status bar */}
            <main
              className={
                isSalesInvoicePage
                  ? "flex-1 overflow-hidden relative z-[1] min-h-0"
                  : "flex-1 overflow-auto p-4 pb-20 lg:pb-14 relative z-[1]"
              }
            >
              {children}
            </main>
          </SidebarInset>
        </div>
        
        <OwnerBottomNav />
        
        <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
        <FloatingWhatsAppInbox />
        <FloatingChatButton />
        <StatusBar />
      </SidebarProvider>
      </MobileScanProvider>
      </DashboardToolbarProvider>
    </ChatProvider>
  );
};
