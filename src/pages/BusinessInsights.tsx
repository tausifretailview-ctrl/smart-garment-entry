import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { LineChart } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function defaultDateRange(): { startDate: string; endDate: string } {
  const fy = getIndiaFinancialYear(0);
  return {
    startDate: fy.fromDate,
    endDate: format(new Date(), "yyyy-MM-dd"),
  };
}

export default function BusinessInsights() {
  const initialRange = useMemo(() => defaultDateRange(), []);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [selectedTab, setSelectedTab] = useState<InsightsTabId>("profitability");
  const [visitedTabs, setVisitedTabs] = useState<Set<InsightsTabId>>(() => new Set());

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
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <BackToDashboard />
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2">
              <LineChart className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Business Insights</h1>
              <p className="text-sm text-muted-foreground">
                Profitability · Stock Health · Supplier Analysis · Sales Trends
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="insights-from-date" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="insights-from-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-40 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insights-to-date" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="insights-to-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-40 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Default range: current financial year (1 Apr – today). Applies to date-filtered tabs.
        </p>
      </div>

      <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="profitability" className="text-sm">
            Profitability
          </TabsTrigger>
          <TabsTrigger value="stock-health" className="text-sm">
            Stock Health
          </TabsTrigger>
          <TabsTrigger value="supplier-analysis" className="text-sm">
            Supplier Analysis
          </TabsTrigger>
          <TabsTrigger value="sales-trends" className="text-sm">
            Sales Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profitability" className="mt-0">
          {shouldMountTab("profitability") ? (
            <ProfitabilityTab startDate={startDate} endDate={endDate} />
          ) : (
            <p className="text-sm text-muted-foreground">Select this tab to load profitability insights.</p>
          )}
        </TabsContent>

        <TabsContent value="stock-health" className="mt-0">
          {shouldMountTab("stock-health") ? (
            <StockHealthTab />
          ) : (
            <p className="text-sm text-muted-foreground">Select this tab to load stock health insights.</p>
          )}
        </TabsContent>

        <TabsContent value="supplier-analysis" className="mt-0">
          {shouldMountTab("supplier-analysis") ? (
            <SupplierAnalysisTab startDate={startDate} endDate={endDate} />
          ) : (
            <p className="text-sm text-muted-foreground">Select this tab to load supplier insights.</p>
          )}
        </TabsContent>

        <TabsContent value="sales-trends" className="mt-0">
          {shouldMountTab("sales-trends") ? (
            <SalesTrendsTab startDate={startDate} endDate={endDate} />
          ) : (
            <p className="text-sm text-muted-foreground">Select this tab to load sales trend insights.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
