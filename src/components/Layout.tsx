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
import { initUIScale } from "@/components/UIScaleSelector";
import { useLocation } from "react-router-dom";
import { DashboardToolbarProvider } from "@/contexts/DashboardToolbarContext";
import { mobileFullscreenMainClass, mobileMainContentClass } from "@/lib/mobileShell";
import { useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { DesktopViewToggle } from "@/components/mobile/DesktopViewToggle";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");
  const location = useLocation();
  const isSalesInvoicePage = /\/sales-invoice(\/|$)/.test(location.pathname);
  const showDesktopChrome = useShowDesktopChrome();

  useEffect(() => {
    initUIScale();
  }, []);

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
