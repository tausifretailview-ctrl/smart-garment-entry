import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";

interface MobileDashboardCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  onClick?: () => void;
  isCurrency?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export const MobileDashboardCard = ({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  onClick,
  isCurrency,
  isLoading,
  isError,
  onRetry
}: MobileDashboardCardProps) => {
  const formatValue = (val: number) => {
    if (isCurrency) {
      if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
      if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
      return `₹${Math.round(val).toLocaleString("en-IN")}`;
    }
    return val.toLocaleString("en-IN");
  };

  // Error state
  if (isError) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-destructive/10")}>
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={(e) => { 
              e.stopPropagation(); 
              onRetry?.(); 
            }}
            className="mt-1 h-7 text-xs px-2 touch-manipulation"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="overflow-hidden active:scale-[0.98] transition-transform touch-manipulation cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", bgColor)}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{title}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <p className={cn("text-xl font-bold mt-1", color)}>
            {formatValue(value)}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
