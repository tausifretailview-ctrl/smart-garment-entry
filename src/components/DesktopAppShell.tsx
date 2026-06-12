import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarExpandStrip } from "@/components/SidebarExpandStrip";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { WhatsAppMessageNotifier } from "@/components/WhatsAppMessageNotifier";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { MobileScanProvider } from "@/contexts/MobileScanContext";
import { StatusBar } from "@/components/StatusBar";
import { IdleMount } from "@/components/IdleMount";
import { DashboardToolbarProvider } from "@/contexts/DashboardToolbarContext";
import { readSidebarLockedOpen } from "@/lib/sidebarPreference";
import { cn } from "@/lib/utils";

interface DesktopAppShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Single sticky desktop chrome: left menu + header + window tabs.
 * Page/tab switches only swap inner content — sidebar does not remount.
 */
export function DesktopAppShell({ children, className }: DesktopAppShellProps) {
  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider defaultOpen={readSidebarLockedOpen()}>
            <OfflineIndicator />

            <div className={cn("flex h-full min-h-0 w-full flex-1 bg-background overflow-hidden", className)}>
              <AppSidebar />
              <SidebarExpandStrip />
              <SidebarInset className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
                <Header />
                <WindowTabsBar />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
              </SidebarInset>
            </div>

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
}
