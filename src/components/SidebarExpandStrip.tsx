import { ChevronsRight } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** Visible left-edge strip when the sidebar is fully collapsed (offcanvas). */
export function SidebarExpandStrip() {
  const { open, setOpen, isMobile } = useSidebar();

  if (isMobile || open) return null;

  return (
    <button
      type="button"
      aria-label="Open menu"
      title="Open menu (Ctrl+B)"
      onClick={() => setOpen(true)}
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden md:flex w-3 flex-col items-center justify-center",
        "bg-sidebar border-r border-sidebar-border shadow-sm",
        "hover:w-10 hover:bg-sidebar-accent/90 transition-[width,background-color] duration-200 ease-out cursor-pointer group",
      )}
    >
      <ChevronsRight className="h-4 w-4 text-primary shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
