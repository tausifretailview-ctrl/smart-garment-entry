import { LayoutGrid } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useHideMobileAppHeader } from "@/hooks/useMobileChrome";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

interface MobileAppHeaderProps {
  title?: string;
  className?: string;
}

/**
 * Native-style top bar on mobile: org name + shortcuts to full menu (no sidebar drawer).
 */
export function MobileAppHeader({ title, className }: MobileAppHeaderProps) {
  const { currentOrganization } = useOrganization();
  const hide = useHideMobileAppHeader();
  const { orgNavigate } = useOrgNavigation();

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
        <button
          type="button"
          onClick={() => orgNavigate("/mobile-more")}
          className={cn(
            "h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center",
            "text-primary-foreground hover:bg-primary-foreground/15",
            "touch-manipulation active:scale-95",
          )}
          aria-label="Open menu"
        >
          <LayoutGrid className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold truncate leading-tight">{label}</p>
          {title && currentOrganization?.name && (
            <p className="text-[10px] opacity-80 truncate">{currentOrganization.name}</p>
          )}
        </div>
        <div className="w-11 shrink-0" aria-hidden />
      </div>
    </header>
  );
}
