import { ReactNode, useEffect } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarExpandStrip } from "@/components/SidebarExpandStrip";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { WhatsAppMessageNotifier } from "@/components/WhatsAppMessageNotifier";
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
import { entryPageLayoutMainClass, isEntryFullscreenPath } from "@/lib/entryPageLayout";
import { initUIScale } from "@/components/UIScaleSelector";
import { readSidebarLockedOpen } from "@/lib/sidebarPreference";

interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  const location = useLocation();
  const isEntryFullscreenPage = isEntryFullscreenPath(location.pathname);
  const showDesktopChrome = useShowDesktopChrome() && !isEntryFullscreenPage;

  useEffect(() => {
    if (isEntryFullscreenPage) initUIScale();
  }, [isEntryFullscreenPage]);

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider
            defaultOpen={readSidebarLockedOpen()}
            className={
              isEntryFullscreenPage
                ? "min-h-0 h-full max-h-full overflow-hidden"
                : undefined
            }
          >
            <OfflineIndicator />

            <div
              className={
                isEntryFullscreenPage
                  ? "flex h-full min-h-0 max-h-full w-full flex-1 overflow-hidden bg-background"
                  : "flex min-h-screen w-full bg-background"
              }
            >
              {showDesktopChrome && <AppSidebar />}
              {showDesktopChrome && <SidebarExpandStrip />}
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
                      ? `${entryPageLayoutMainClass} animate-fade-in`
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

            <WhatsAppMessageNotifier />
            <IdleMount>
              <div className="hidden lg:contents">
                <FloatingChatButton />
              </div>
            </IdleMount>
            {!isEntryFullscreenPage && <StatusBar />}
          </SidebarProvider>
        </MobileScanProvider>
      </DashboardToolbarProvider>
    </ChatProvider>
  );
};
