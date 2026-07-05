import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
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
import { DesktopViewEscapeHatch } from "@/components/mobile/DesktopViewToggle";
import { IdleMount } from "@/components/IdleMount";
import { DashboardToolbarProvider } from "@/contexts/DashboardToolbarContext";
import { readSidebarLockedOpen } from "@/lib/sidebarPreference";
import { isNoSidebarEntryPath, isSidebarOnlyWorkspacePath } from "@/lib/entryPageLayout";
import { cn } from "@/lib/utils";

interface DesktopAppShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Single sticky desktop chrome: left menu + header + window tabs.
 * POS / Sale Bill / Purchase Bill: no sidebar or global menu bar; window tab strip stays visible.
 */
export function DesktopAppShell({ children, className }: DesktopAppShellProps) {
  const location = useLocation();
  const billingFullScreen = isNoSidebarEntryPath(location.pathname);
  const sidebarOnlyWorkspace = isSidebarOnlyWorkspacePath(location.pathname);

  return (
    <ChatProvider>
      <DashboardToolbarProvider>
        <MobileScanProvider>
          <SidebarProvider defaultOpen={readSidebarLockedOpen()}>
            <OfflineIndicator />

            <div className={cn("flex h-full min-h-0 w-full flex-1 bg-[var(--erp-bg)] overflow-hidden", className)}>
              {!billingFullScreen && <AppSidebar />}
              {!billingFullScreen && <SidebarExpandStrip />}
              <SidebarInset className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
                {!billingFullScreen && !sidebarOnlyWorkspace && (
                  <div className="erp-chrome-stack">
                    <Header />
                    <WindowTabsBar />
                  </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
                {!billingFullScreen && <StatusBar />}
              </SidebarInset>
            </div>

            <WhatsAppMessageNotifier />
            <IdleMount>
              <div className="hidden lg:contents">
                <FloatingWhatsAppInbox />
                <FloatingChatButton />
              </div>
            </IdleMount>
            <DesktopViewEscapeHatch />
          </SidebarProvider>
        </MobileScanProvider>
      </DashboardToolbarProvider>
    </ChatProvider>
  );
}
