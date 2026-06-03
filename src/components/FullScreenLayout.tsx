import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { OwnerBottomNav } from "@/components/mobile/OwnerBottomNav";
import { MobileAppHeader } from "@/components/mobile/MobileAppHeader";
import { PwaInstallBanner } from "@/components/mobile/PwaInstallBanner";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { MobileScanProvider } from "@/contexts/MobileScanContext";
import { StatusBar } from "@/components/StatusBar";
import { useLocation } from "react-router-dom";
import { DashboardToolbarProvider } from "@/contexts/DashboardToolbarContext";
import { mobileFullscreenMainClass, mobileMainContentClass } from "@/lib/mobileShell";
import { useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { DesktopViewToggle } from "@/components/mobile/DesktopViewToggle";
import { IdleMount } from "@/components/IdleMount";

interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  const location = useLocation();
  const isEntryFullscreenPage = /\/(sales-invoice|purchase-entry)\/?$/.test(location.pathname);
  const showDesktopChrome = useShowDesktopChrome();

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider defaultOpen={false}>
            <OfflineIndicator />

            <div
              className={
                isEntryFullscreenPage
                  ? "flex h-screen w-full overflow-hidden bg-background"
                  : "flex min-h-screen w-full bg-background"
              }
            >
              {showDesktopChrome && (
                <div className="shrink-0">
                  <AppSidebar />
                </div>
              )}
              <SidebarInset
                className={
                  isEntryFullscreenPage
                    ? "flex flex-col flex-1 min-h-0 overflow-hidden min-w-0"
                    : "flex flex-col flex-1 min-w-0"
                }
              >
                {!isEntryFullscreenPage && (
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
                    isEntryFullscreenPage
                      ? `${mobileFullscreenMainClass} animate-fade-in`
                      : `${mobileMainContentClass} animate-fade-in`
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
