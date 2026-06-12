import { ChevronsRight } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useForceDesktopView } from "@/hooks/useDesktopViewPreference";
import { cn } from "@/lib/utils";
import { writeSidebarLockedOpen } from "@/lib/sidebarPreference";

/** Visible left-edge strip when the sidebar is fully collapsed (offcanvas). */
export function SidebarExpandStrip() {
  const { open, setOpen, isMobile } = useSidebar();
  const forceDesktopLayout = useForceDesktopView();

  if ((isMobile && !forceDesktopLayout) || open) return null;

  const handleOpen = () => {
    writeSidebarLockedOpen(true);
    setOpen(true);
  };

  return (
    <button
      type="button"
      aria-label="Open menu"
      title="Open menu (Ctrl+B)"
      onClick={handleOpen}
      className={cn(
        "fixed inset-y-0 left-0 z-40 w-3 flex-col items-center justify-center",
        forceDesktopLayout ? "flex" : "hidden md:flex",
        "bg-sidebar border-r border-sidebar-border shadow-sm",
        "hover:w-10 hover:bg-sidebar-accent/90 transition-[width,background-color] duration-200 ease-out cursor-pointer group",
      )}
    >
      <ChevronsRight className="h-4 w-4 text-primary shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
