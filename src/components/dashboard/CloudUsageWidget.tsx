import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, HelpCircle, TrendingDown, Zap } from "lucide-react";
import { useCloudUsageEstimate, formatReadCount, getProgressColor } from "@/hooks/useCloudUsageEstimate";

/**
 * Cloud Usage Widget for Platform Admin Dashboard
 * Shows estimated daily database reads and optimization savings
 */
export const CloudUsageWidget = () => {
  const estimate = useCloudUsageEstimate();

  // Calculate a "usage level" for the progress bar (capped at daily limit)
  // Using 50K as a reasonable daily read budget for a small cloud instance
  const DAILY_READ_BUDGET = 50000;
  const usagePercent = Math.min((estimate.totalDailyReads / DAILY_READ_BUDGET) * 100, 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Cloud Usage Today</CardTitle>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Estimated daily database reads based on active organizations, 
                  current polling settings, and typical usage patterns. 
                  Actual usage may vary.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription>
          Estimated database reads across all organizations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Usage Display */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold">{formatReadCount(estimate.totalDailyReads)}</p>
              <p className="text-sm text-muted-foreground">estimated daily reads</p>
            </div>
            <Badge variant="success" className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              {estimate.savingsPercent}% saved
            </Badge>
          </div>
          
          <div className="space-y-1">
            <Progress 
              value={usagePercent} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground text-right">
              {usagePercent.toFixed(0)}% of daily budget ({formatReadCount(DAILY_READ_BUDGET)})
            </p>
          </div>
        </div>

        {/* Savings Comparison */}
        <div className="p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center justify-between">
            <span className="text-sm">Before optimization:</span>
            <span className="text-sm font-medium line-through text-muted-foreground">
              ~{formatReadCount(estimate.beforeOptimization)}/day
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm">Current usage:</span>
            <span className="text-sm font-medium text-success">
              ~{formatReadCount(estimate.totalDailyReads)}/day
            </span>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="space-y-2">
          <p className="text-sm font-medium">By Category:</p>
          <div className="grid grid-cols-2 gap-2">
            {estimate.categories.map((category) => (
              <div 
                key={category.name}
                className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
              >
                <span className="text-muted-foreground">{category.name}</span>
                <span className="font-mono">
                  {category.queriesPerHour === 0 ? (
                    <span className="text-success text-xs">Manual</span>
                  ) : (
                    `~${formatReadCount(category.queriesPerHour)}/hr`
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tier Indicator */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm">Refresh Mode:</span>
          </div>
          <Badge variant="outline" className="capitalize">
            {estimate.tier === 'free' ? 'Manual Refresh' : estimate.tier}
          </Badge>
        </div>

        {/* Active Orgs */}
        <p className="text-xs text-muted-foreground text-center">
          Based on {estimate.activeOrgsCount} active organization{estimate.activeOrgsCount !== 1 ? 's' : ''} 
          × {estimate.activeHoursPerDay} hours/day
        </p>
      </CardContent>
    </Card>
  );
};
