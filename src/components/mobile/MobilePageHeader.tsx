import { ChevronLeft } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

interface MobilePageHeaderProps {
  title: string;
  backTo?: string;
  rightContent?: React.ReactNode;
  subtitle?: string;
}

export const MobilePageHeader = ({ title, backTo, rightContent, subtitle }: MobilePageHeaderProps) => {
  const { orgNavigate } = useOrgNavigation();
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {backTo && (
            <button
              onClick={() => orgNavigate(backTo)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 active:scale-90 touch-manipulation"
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
