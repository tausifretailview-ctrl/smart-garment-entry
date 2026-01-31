import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");

  return (
    <ChatProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            <Header />
            <WindowTabsBar />
            <div className="flex lg:hidden items-center gap-1 px-2 py-0.5 border-b bg-sidebar">
              <SidebarTrigger className="text-sidebar-foreground h-5 w-5" />
            </div>
            <main className="flex-1 overflow-auto p-4">{children}</main>
            <Footer />
          </SidebarInset>
        </div>
        <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
        <FloatingWhatsAppInbox />
        <FloatingChatButton />
      </SidebarProvider>
    </ChatProvider>
  );
};
