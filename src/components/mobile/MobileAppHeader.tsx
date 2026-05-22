import { Menu } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useHideMobileAppHeader } from "@/hooks/useMobileChrome";
import { cn } from "@/lib/utils";

interface MobileAppHeaderProps {
  title?: string;
  className?: string;
}

/**
 * Native-style top bar on mobile: brand strip + menu (opens sidebar drawer).
 */
export function MobileAppHeader({ title, className }: MobileAppHeaderProps) {
  const { currentOrganization } = useOrganization();
  const hide = useHideMobileAppHeader();

  if (hide) return null;

  const label = title?.trim() || currentOrganization?.name || "EzzyERP";

  return (
    <header
      className={cn(
        "lg:hidden sticky top-0 z-30 shrink-0",
        "bg-primary text-primary-foreground safe-area-pt",
        "border-b border-primary-foreground/10 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 h-12 px-3 max-w-lg mx-auto w-full">
        <SidebarTrigger
          className={cn(
            "h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl",
            "text-primary-foreground hover:bg-primary-foreground/15",
            "touch-manipulation active:scale-95",
          )}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{label}</p>
          {title && currentOrganization?.name && (
            <p className="text-[10px] opacity-80 truncate">{currentOrganization.name}</p>
          )}
        </div>
      </div>
    </header>
  );
}
