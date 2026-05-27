import { ReactNode, useEffect } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { OwnerBottomNav } from "@/components/mobile/OwnerBottomNav";
import { MobileAppHeader } from "@/components/mobile/MobileAppHeader";
import { PwaInstallBanner } from "@/components/mobile/PwaInstallBanner";
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
import { mobileFullscreenMainClass, mobileMainContentClass } from "@/lib/mobileShell";
import { useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { DesktopViewToggle } from "@/components/mobile/DesktopViewToggle";

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
  const isSalesInvoicePage = /\/sales-invoice(\/|$)/.test(location.pathname);
  const showDesktopChrome = useShowDesktopChrome();

  useEffect(() => {
    initUIScale();
  }, []);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "n":
            e.preventDefault();
            orgNavigate("/sales-invoice");
            break;
          case "p":
            e.preventDefault();
            orgNavigate("/pos-sales");
            break;
          case "b":
            e.preventDefault();
            orgNavigate("/purchase-entry");
            break;
          case "d": {
            e.preventDefault();
            if (permissionsLoading) break;
            const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
            orgNavigate(fallback ? `/${fallback}` : "/");
            break;
          }
          case "s":
            e.preventDefault();
            orgNavigate("/stock-report");
            break;
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [orgNavigate, permissionsLoading, hasMenuAccess, permissions, organizationRole]);

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider defaultOpen={false}>
            <OfflineIndicator />

            <div className="flex min-h-screen w-full bg-background">
              {showDesktopChrome && (
                <div className="shrink-0">
                  <AppSidebar />
                </div>
              )}
              <SidebarInset className="flex flex-col flex-1 min-w-0">
                {!isSalesInvoicePage && (
                  <>
                    {showDesktopChrome && (
                      <>
                        <Header />
                        <WindowTabsBar />
                        <div className="px-3 pt-2 lg:hidden">
                          <DesktopViewToggle variant="banner" />
                        </div>
                      </>
                    )}
                    {!showDesktopChrome && <MobileAppHeader />}
                  </>
                )}
                <main
                  className={
                    isSalesInvoicePage
                      ? mobileFullscreenMainClass
                      : showDesktopChrome
                        ? "flex-1 overflow-auto relative z-[1] min-w-0 p-3 sm:p-4 pb-14 animate-fade-in"
                        : mobileMainContentClass
                  }
                >
                  {children}
                </main>
              </SidebarInset>
            </div>

            {!showDesktopChrome && <OwnerBottomNav />}
            <PwaInstallBanner />

            <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
            <div className="hidden lg:contents">
              <FloatingWhatsAppInbox />
              <FloatingChatButton />
            </div>
            <StatusBar />
          </SidebarProvider>
        </MobileScanProvider>
      </DashboardToolbarProvider>
    </ChatProvider>
  );
};
