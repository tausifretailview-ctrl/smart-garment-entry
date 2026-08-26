import { memo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { prefetchTabPage } from "@/lib/tabPageRegistry";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

// Vasy-style pastel KPI card — centered value, soft background, large readable type
const METRIC_PASTEL: Record<string, { shell: string; value: string }> = {
  "bg-blue-500": { shell: "bg-sky-50 border-sky-200/70 hover:bg-sky-100/80", value: "text-sky-800" },
  "bg-blue-600": { shell: "bg-sky-50 border-sky-200/70 hover:bg-sky-100/80", value: "text-sky-800" },
  "bg-green-500": { shell: "bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80", value: "text-emerald-800" },
  "bg-green-600": { shell: "bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80", value: "text-emerald-800" },
  "bg-emerald-500": { shell: "bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80", value: "text-emerald-800" },
  "bg-orange-500": { shell: "bg-orange-50 border-orange-200/70 hover:bg-orange-100/80", value: "text-orange-800" },
  "bg-amber-500": { shell: "bg-amber-50 border-amber-200/70 hover:bg-amber-100/80", value: "text-amber-900" },
  "bg-red-500": { shell: "bg-rose-50 border-rose-200/70 hover:bg-rose-100/80", value: "text-rose-800" },
  "bg-pink-500": { shell: "bg-pink-50 border-pink-200/70 hover:bg-pink-100/80", value: "text-pink-800" },
  "bg-purple-500": { shell: "bg-violet-50 border-violet-200/70 hover:bg-violet-100/80", value: "text-violet-800" },
  "bg-violet-500": { shell: "bg-violet-50 border-violet-200/70 hover:bg-violet-100/80", value: "text-violet-800" },
  "bg-indigo-500": { shell: "bg-indigo-50 border-indigo-200/70 hover:bg-indigo-100/80", value: "text-indigo-800" },
  "bg-cyan-500": { shell: "bg-cyan-50 border-cyan-200/70 hover:bg-cyan-100/80", value: "text-cyan-800" },
  "bg-teal-500": { shell: "bg-teal-50 border-teal-200/70 hover:bg-teal-100/80", value: "text-teal-800" },
  "bg-slate-500": { shell: "bg-slate-50 border-slate-200/70 hover:bg-slate-100/80", value: "text-slate-800" },
};

/**
 * Only this leaf re-renders while the count-up animation runs — the card shell
 * and its Radix tooltip stay mounted and untouched.
 */
const AnimatedMetricValue = memo(
  ({
    value,
    isCurrency,
    placeholder,
    className,
  }: {
    value: number;
    isCurrency: boolean;
    placeholder: boolean;
    className: string;
  }) => {
    const animated = useCountUp(value, {
      durationMs: 450,
      fromPrevious: true,
      enabled: !placeholder,
    });

    const displayValue = placeholder
      ? "—"
      : isCurrency
        ? formatCurrency(animated)
        : Math.round(animated).toLocaleString("en-IN");

    return <p className={className}>{displayValue}</p>;
  },
);
AnimatedMetricValue.displayName = "AnimatedMetricValue";

const DashboardMetricCardBase = ({
  title,
  value,
  icon: Icon,
  accentColor,
  onClick,
  prefetchPath,
  tooltip,
  isCurrency = false,
  placeholder = false,
  loading = false,
}: {
  title: string;
  value: number;
  icon: any;
  accentColor: string;
  onClick?: () => void;
  /** Tab-cache path — warm JS chunk on hover/touch before navigate. */
  prefetchPath?: string;
  tooltip?: string;
  isCurrency?: boolean;
  placeholder?: boolean;
  loading?: boolean;
}) => {
  const pastel = METRIC_PASTEL[accentColor] ?? METRIC_PASTEL["bg-blue-500"];
  const refreshing = loading && !placeholder;

  const warmPrefetch = useCallback(() => {
    if (!prefetchPath || placeholder) return;
    prefetchTabPage(prefetchPath);
  }, [prefetchPath, placeholder]);

  const warmPrefetchIntent = useCallback(() => {
    if (!prefetchPath || placeholder) return;
    prefetchTabPage(prefetchPath, { intent: true });
  }, [prefetchPath, placeholder]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="group dashboard-metric-card"
          onClick={placeholder ? undefined : onClick}
          onPointerEnter={warmPrefetch}
          onFocus={warmPrefetch}
          onTouchStart={warmPrefetchIntent}
        >
          <Card
            className={cn(
              "dashboard-metric-card-inner relative overflow-hidden rounded-xl border shadow-sm transition-colors duration-150",
              pastel.shell,
              placeholder
                ? "cursor-default opacity-90"
                : "cursor-pointer hover:shadow-md",
            )}
          >
            <CardContent className="flex h-full min-h-[100px] flex-col items-center justify-center px-3 py-4 text-center">
              <p className="text-sm font-semibold leading-snug text-slate-600 line-clamp-2">{title}</p>
              <AnimatedMetricValue
                value={value}
                isCurrency={isCurrency}
                placeholder={placeholder}
                className={cn(
                  "mt-2 text-2xl font-bold tabular-nums leading-none sm:text-[1.65rem] transition-opacity duration-150",
                  placeholder ? "text-slate-400" : pastel.value,
                  refreshing && "opacity-60",
                )}
              />
              <Icon
                className={cn(
                  "absolute right-2.5 top-2.5 h-4 w-4 opacity-25",
                  placeholder ? "text-slate-400" : "text-slate-500",
                )}
              />
            </CardContent>
          </Card>
        </div>
      </TooltipTrigger>
      {tooltip && (
        <TooltipContent side="bottom" className="max-w-[220px] border-border bg-popover text-popover-foreground">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
};

export const DashboardMetricCard = memo(DashboardMetricCardBase);
