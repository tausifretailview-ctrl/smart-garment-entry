import { ReactNode, useEffect } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarExpandStrip } from "@/components/SidebarExpandStrip";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { WhatsAppMessageNotifier } from "@/components/WhatsAppMessageNotifier";
import { OwnerBottomNav } from "@/components/mobile/OwnerBottomNav";
import { MobileAppHeader } from "@/components/mobile/MobileAppHeader";
import { PwaInstallBanner } from "@/components/mobile/PwaInstallBanner";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { MobileScanProvider } from "@/contexts/MobileScanContext";
import { StatusBar } from "@/components/StatusBar";
import { IdleMount } from "@/components/IdleMount";
import { initUIScale } from "@/components/UIScaleSelector";
import { useLocation } from "react-router-dom";
import { DashboardToolbarProvider } from "@/contexts/DashboardToolbarContext";
import { mobileFullscreenMainClass, mobileMainContentClass } from "@/lib/mobileShell";
import { useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { DesktopViewToggle } from "@/components/mobile/DesktopViewToggle";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { cn } from "@/lib/utils";
import { readSidebarLockedOpen } from "@/lib/sidebarPreference";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");
  const location = useLocation();
  const isSalesInvoicePage = /\/sales-invoice(\/|$)/.test(location.pathname);
  const showDesktopChrome = useShowDesktopChrome();
  const inTabCachePane = useTabCacheLayout();
  const sharedShell = useSharedAppShell();

  useEffect(() => {
    initUIScale();
  }, []);

  if (sharedShell) {
    return (
      <main
        className={cn(
          "flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto tab-scroll-stable relative z-[1] p-3 sm:p-4 pb-14 animate-fade-in",
          inTabCachePane && "data-tab-scroll",
        )}
      >
        {children}
      </main>
    );
  }

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider defaultOpen={readSidebarLockedOpen()}>
            <OfflineIndicator />

            <div
              className={cn(
                "flex w-full bg-background",
                inTabCachePane
                  ? "h-full min-h-0 overflow-hidden"
                  : "min-h-screen",
              )}
            >
              {showDesktopChrome && <AppSidebar />}
              {showDesktopChrome && <SidebarExpandStrip />}
              <SidebarInset
                className={cn(
                  "flex flex-col flex-1 min-w-0",
                  inTabCachePane && "!min-h-0 h-full overflow-hidden",
                )}
              >
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
                        ? cn(
                            "flex-1 min-h-0 overflow-y-auto tab-scroll-stable relative z-[1] min-w-0 p-3 sm:p-4 pb-14 animate-fade-in",
                            inTabCachePane && "data-tab-scroll",
                          )
                        : mobileMainContentClass
                  }
                >
                  {children}
                </main>
              </SidebarInset>
            </div>

            {!showDesktopChrome && <OwnerBottomNav />}
            <IdleMount>
              <PwaInstallBanner />
            </IdleMount>

            <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
            <WhatsAppMessageNotifier />
            <IdleMount>
              <div className="hidden lg:contents">
                <FloatingWhatsAppInbox />
                <FloatingChatButton />
              </div>
            </IdleMount>
            <StatusBar />
          </SidebarProvider>
        </MobileScanProvider>
      </DashboardToolbarProvider>
    </ChatProvider>
  );
};
