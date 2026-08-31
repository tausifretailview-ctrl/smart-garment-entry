import { ChevronLeft } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

interface MobilePageHeaderProps {
  title: string;
  backTo?: string;
  onBackClick?: () => void;
  rightContent?: React.ReactNode;
  subtitle?: string;
}

export const MobilePageHeader = ({ title, backTo, onBackClick, rightContent, subtitle }: MobilePageHeaderProps) => {
  const { orgNavigate } = useOrgNavigation();
  const showBack = Boolean(onBackClick || backTo);
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border pt-[max(1.75rem,env(safe-area-inset-top,0px))]">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={() => (onBackClick ? onBackClick() : orgNavigate(backTo!))}
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-full bg-muted flex items-center justify-center shrink-0 active:scale-90 touch-manipulation"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
      </div>
    </div>
  );
};
