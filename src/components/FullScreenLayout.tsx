import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileFAB } from "@/components/mobile/MobileFAB";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";

interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  return (
    <ChatProvider>
      <SidebarProvider>
        {/* Mobile offline indicator */}
        <OfflineIndicator />
        
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            <Header />
            <WindowTabsBar />
            <div className="flex lg:hidden items-center gap-2 px-4 py-2 border-b bg-sidebar">
              <SidebarTrigger className="text-sidebar-foreground" />
            </div>
            {/* Add bottom padding on mobile for bottom nav */}
            <main className="flex-1 animate-fade-in p-4 pb-20 lg:pb-4">{children}</main>
          </SidebarInset>
        </div>
        
        {/* Mobile navigation */}
        <MobileBottomNav />
        <MobileFAB />
        
        <FloatingWhatsAppInbox />
        <FloatingChatButton />
      </SidebarProvider>
    </ChatProvider>
  );
};
