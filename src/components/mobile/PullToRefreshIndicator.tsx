import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  visible: boolean;
  className?: string;
}

export function PullToRefreshIndicator({ visible, className }: PullToRefreshIndicatorProps) {
  if (!visible) return null;
  return (
    <div
      className={cn(
        "flex justify-center py-2 sticky top-0 z-20 bg-background/80 backdrop-blur-sm",
        className
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <RefreshCw className="h-5 w-5 text-primary animate-spin" />
    </div>
  );
}
