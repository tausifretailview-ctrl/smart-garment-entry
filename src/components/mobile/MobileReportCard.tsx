import { ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface MobileReportCardProps {
  icon: React.ElementType;
  label: string;
  desc: string;
  categoryColor: string;
  onClick: () => void;
  showDivider?: boolean;
}

export const MobileReportCard = ({
  icon: Icon,
  label,
  desc,
  categoryColor,
  onClick,
  showDivider = false
}: MobileReportCardProps) => (
  <>
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3.5",
        "active:bg-muted/50 transition-colors duration-100",
        "touch-manipulation"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
          <Icon className={cn("h-5 w-5", categoryColor)} />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
    {showDivider && <Separator className="ml-16" />}
  </>
);
