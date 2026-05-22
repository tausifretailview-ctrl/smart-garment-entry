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

interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  const location = useLocation();
  const isSalesInvoicePage = /\/sales-invoice\/?$/.test(location.pathname);

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider defaultOpen={false}>
            <OfflineIndicator />

            <div
              className={
                isSalesInvoicePage
                  ? "flex h-screen w-full overflow-hidden bg-background"
                  : "flex min-h-screen w-full bg-background"
              }
            >
              <div className="hidden lg:block shrink-0">
                <AppSidebar />
              </div>
              <SidebarInset
                className={
                  isSalesInvoicePage
                    ? "flex flex-col flex-1 min-h-0 overflow-hidden min-w-0"
                    : "flex flex-col flex-1 min-w-0"
                }
              >
                {!isSalesInvoicePage && (
                  <>
                    <div className="hidden lg:block">
                      <Header />
                      <WindowTabsBar />
                    </div>
                    <MobileAppHeader />
                  </>
                )}
                <main
                  className={
                    isSalesInvoicePage
                      ? `${mobileFullscreenMainClass} animate-fade-in`
                      : `${mobileMainContentClass} animate-fade-in`
                  }
                >
                  {children}
                </main>
              </SidebarInset>
            </div>

            <OwnerBottomNav />
            <PwaInstallBanner />

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
