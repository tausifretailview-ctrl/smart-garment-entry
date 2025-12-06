import { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, setIsOpen } = useKeyboardShortcuts("general");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          <Header />
          <div className="flex lg:hidden items-center gap-2 px-4 py-2 border-b bg-sidebar">
            <SidebarTrigger className="text-sidebar-foreground" />
          </div>
          <main className="flex-1 animate-fade-in p-4">{children}</main>
          <Footer />
        </SidebarInset>
      </div>
      <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="general" />
    </SidebarProvider>
  );
};
