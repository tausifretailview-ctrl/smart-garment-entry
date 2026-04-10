import { ReactNode } from "react";
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

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");

  return (
    <ChatProvider>
      <SidebarProvider defaultOpen={false}>
        {/* Mobile offline indicator */}
        <OfflineIndicator />
        
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            <Header />
            {/* WindowTabsBar hidden on mobile to prevent tooltip touch interference */}
            <div className="hidden lg:block">
              <WindowTabsBar />
            </div>
            <div className="flex lg:hidden items-center gap-1 px-2 py-0.5 border-b bg-sidebar">
              <SidebarTrigger className="text-sidebar-foreground h-5 w-5" />
            </div>
            {/* Add bottom padding on mobile for bottom nav; lg adds extra for status bar */}
            <main className="flex-1 overflow-auto p-4 pb-20 lg:pb-14 relative z-[1]">{children}</main>
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
