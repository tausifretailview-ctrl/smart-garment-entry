import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MobileDashboardCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  onClick?: () => void;
  isCurrency?: boolean;
  isLoading?: boolean;
}

export const MobileDashboardCard = ({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  onClick,
  isCurrency,
  isLoading
}: MobileDashboardCardProps) => {
  const formatValue = (val: number) => {
    if (isCurrency) {
      if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
      if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
      return `₹${Math.round(val).toLocaleString("en-IN")}`;
    }
    return val.toLocaleString("en-IN");
  };

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
