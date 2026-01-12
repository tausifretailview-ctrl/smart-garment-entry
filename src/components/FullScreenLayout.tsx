import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  return (
    <ChatProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            <Header />
            <WindowTabsBar />
            <div className="flex lg:hidden items-center gap-2 px-4 py-2 border-b bg-sidebar">
              <SidebarTrigger className="text-sidebar-foreground" />
            </div>
            <main className="flex-1 animate-fade-in p-4">{children}</main>
          </SidebarInset>
        </div>
        <FloatingWhatsAppInbox />
        <FloatingChatButton />
      </SidebarProvider>
    </ChatProvider>
  );
};
