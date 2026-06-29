import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, LineChart } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getIndiaFinancialYear } from "@/utils/accountingReportUtils";
import { ProfitabilityTab } from "@/components/business-insights/ProfitabilityTab";
import { StockHealthTab } from "@/components/business-insights/StockHealthTab";
import { SupplierAnalysisTab } from "@/components/business-insights/SupplierAnalysisTab";
import { SalesTrendsTab } from "@/components/business-insights/SalesTrendsTab";

type InsightsTabId =
  | "profitability"
  | "stock-health"
  | "supplier-analysis"
  | "sales-trends";

const TAB_ITEMS: { id: InsightsTabId; label: string }[] = [
  { id: "profitability", label: "Profitability" },
  { id: "stock-health", label: "Stock Health" },
  { id: "supplier-analysis", label: "Supplier Analysis" },
  { id: "sales-trends", label: "Sales Trends" },
];

function defaultDateRange(): { startDate: string; endDate: string } {
  const fy = getIndiaFinancialYear(0);
  return {
    startDate: fy.fromDate,
    endDate: format(new Date(), "yyyy-MM-dd"),
  };
}

export default function BusinessInsights() {
  const { orgNavigate } = useOrgNavigation();
  const initialRange = useMemo(() => defaultDateRange(), []);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [selectedTab, setSelectedTab] = useState<InsightsTabId>("profitability");
  const [visitedTabs, setVisitedTabs] = useState<Set<InsightsTabId>>(
    () => new Set(["profitability"]),
  );

  const shouldMountTab = useCallback(
    (tab: InsightsTabId) => visitedTabs.has(tab),
    [visitedTabs],
  );

  const handleTabChange = useCallback((tab: string) => {
    const id = tab as InsightsTabId;
    setSelectedTab(id);
    setVisitedTabs((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        {/* Toolbar — Vasy-style compact header */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <LineChart className="h-5 w-5 shrink-0" />
                Business Insights
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Profitability · Stock Health · Supplier · Sales Trends
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 shrink-0">
            <div className="space-y-1">
              <Label htmlFor="insights-from-date" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                From
              </Label>
              <Input
                id="insights-from-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-[9.5rem] text-sm border-slate-200 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="insights-to-date" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                To
              </Label>
              <Input
                id="insights-to-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-[9.5rem] text-sm border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>

        <Tabs
          value={selectedTab}
          onValueChange={handleTabChange}
          className="flex flex-col flex-1 min-h-0 gap-2"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
            {TAB_ITEMS.map(({ id, label }) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  "h-9 px-4 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
                  "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
                )}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profitability" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("profitability") ? (
              <ProfitabilityTab startDate={startDate} endDate={endDate} />
            ) : null}
          </TabsContent>

          <TabsContent value="stock-health" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("stock-health") ? <StockHealthTab /> : null}
          </TabsContent>

          <TabsContent value="supplier-analysis" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("supplier-analysis") ? (
              <SupplierAnalysisTab startDate={startDate} endDate={endDate} />
            ) : null}
          </TabsContent>

          <TabsContent value="sales-trends" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            {shouldMountTab("sales-trends") ? (
              <SalesTrendsTab startDate={startDate} endDate={endDate} />
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
