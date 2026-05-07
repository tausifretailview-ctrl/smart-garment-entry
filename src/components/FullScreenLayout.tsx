import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { OwnerBottomNav } from "@/components/mobile/OwnerBottomNav";
import { MobileFAB } from "@/components/mobile/MobileFAB";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { StatusBar } from "@/components/StatusBar";
import { useLocation } from "react-router-dom";

interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  const location = useLocation();
  // Full-screen billing: hide sidebar + header/tabs ONLY on Sales Invoice entry page
  // (not the dashboard). Matches /sales-invoice and /:org/sales-invoice exactly.
  const isSalesInvoicePage = /\/sales-invoice\/?$/.test(location.pathname);
  return (
    <ChatProvider>
      <SidebarProvider defaultOpen={!isSalesInvoicePage}>
        {/* Mobile offline indicator */}
        <OfflineIndicator />
        
        <div className={
          isSalesInvoicePage
            ? "flex h-screen w-full overflow-hidden bg-background"
            : "flex min-h-screen w-full bg-background"
        }>
          <AppSidebar />
          <SidebarInset className={
            isSalesInvoicePage
              ? "flex flex-col flex-1 min-h-0 overflow-hidden"
              : "flex flex-col flex-1"
          }>
            {!isSalesInvoicePage && (
              <>
                <Header />
                {/* WindowTabsBar hidden on mobile to prevent tooltip touch interference */}
                <div className="hidden lg:block">
                  <WindowTabsBar />
                </div>
                <div className="flex lg:hidden items-center gap-2 px-4 py-2 border-b bg-sidebar">
                  <SidebarTrigger className="text-sidebar-foreground" />
                </div>
              </>
            )}
            {/* Add bottom padding on mobile for bottom nav; z-[1] ensures content is below fixed nav elements */}
            <main
              className={
                isSalesInvoicePage
                  ? "flex-1 animate-fade-in relative z-[1] min-h-0 overflow-hidden"
                  : "flex-1 animate-fade-in p-4 pb-20 lg:pb-10 relative z-[1]"
              }
            >
              {children}
            </main>
          </SidebarInset>
        </div>
        
        {/* Mobile navigation */}
        <OwnerBottomNav />
        <MobileFAB />
        
        <FloatingWhatsAppInbox />
        <FloatingChatButton />
        <StatusBar />
      </SidebarProvider>
    </ChatProvider>
  );
};
