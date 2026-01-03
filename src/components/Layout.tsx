import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";

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
            <div className="flex lg:hidden items-center gap-2 px-2 py-1 border-b bg-sidebar">
              <SidebarTrigger className="text-sidebar-foreground h-6 w-6" />
            </div>
            <main className="flex-1 overflow-auto animate-fade-in p-2">{children}</main>
            <Footer />
          </SidebarInset>
        </div>
        <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
        <FloatingChatButton />
      </SidebarProvider>
    </ChatProvider>
  );
};
