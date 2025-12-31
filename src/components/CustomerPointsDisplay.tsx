import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CustomerPointsDisplayProps {
  currentBalance?: number;
  pointsToEarn?: number;
  showCurrentBalance?: boolean;
  showPointsToEarn?: boolean;
  compact?: boolean;
}

export function CustomerPointsDisplay({
  currentBalance = 0,
  pointsToEarn = 0,
  showCurrentBalance = true,
  showPointsToEarn = true,
  compact = false,
}: CustomerPointsDisplayProps) {
  if (!showCurrentBalance && !showPointsToEarn) return null;
  if (currentBalance === 0 && pointsToEarn === 0) return null;

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {showCurrentBalance && currentBalance > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0.5">
                  <Coins className="h-3 w-3" />
                  {currentBalance}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Current Points Balance: {currentBalance}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {showPointsToEarn && pointsToEarn > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0.5 text-green-600 border-green-300">
                  +{pointsToEarn}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Points to Earn: +{pointsToEarn}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Coins className="h-4 w-4 text-amber-500" />
      <div className="flex items-center gap-2">
        {showCurrentBalance && currentBalance > 0 && (
          <span className="text-muted-foreground">
            Balance: <span className="font-medium text-foreground">{currentBalance}</span>
          </span>
        )}
        {showCurrentBalance && currentBalance > 0 && showPointsToEarn && pointsToEarn > 0 && (
          <span className="text-muted-foreground">•</span>
        )}
        {showPointsToEarn && pointsToEarn > 0 && (
          <span className="text-green-600 font-medium">
            +{pointsToEarn} pts
          </span>
        )}
      </div>
    </div>
  );
}

// Simple inline display for use in lists/tables
export function PointsBadge({ points, variant = "balance" }: { points: number; variant?: "balance" | "earn" }) {
  if (points === 0) return null;

  if (variant === "earn") {
    return (
      <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300">
        <Coins className="h-3 w-3" />
        +{points}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-xs gap-1">
      <Coins className="h-3 w-3" />
      {points}
    </Badge>
  );
}
