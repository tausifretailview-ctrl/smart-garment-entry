import { useState, useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import {
  Loader2,
  Download,
  Printer,
  TrendingUp,
  Users,
  Package,
  Search,
  Calendar,
  ArrowLeft,
  Building2,
  Clock,
  FileText,
  UserRound,
  UserCheck,
  Layers,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { getIndiaFinancialYear, getCurrentQuarter } from "@/utils/accountingReportUtils";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useProductFieldLabels } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import {
  loadProfitDataset,
  aggregateForTab,
  sumAggregates,
  FIELD_DIMENSION_OPTIONS,
  type ProfitDataset,
  type ProfitAggregateRow,
  type NetProfitTab,
  type NetProfitFieldDimension,
} from "@/utils/netProfitAnalysis";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

const FYPresets = ({
  onSelect,
  currentSelection,
}: {
  onSelect: (from: string, to: string, key: string) => void;
  currentSelection?: string;
}) => {
  const currentFY = getIndiaFinancialYear(0);
  const previousFY = getIndiaFinancialYear(-1);
  const currentQ = getCurrentQuarter();
  const now = new Date();

  const todayStart = format(now, "yyyy-MM-dd");
  const todayEnd = format(now, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  return (
    <div className="flex flex-wrap gap-1.5">
      {(
        [
          ["today", "Today", todayStart, todayEnd],
          ["week", "This Week", weekStart, weekEnd],
          ["month", "This Month", monthStart, monthEnd],
          ["currentQ", currentQ.label, currentQ.fromDate, currentQ.toDate],
          ["currentFY", currentFY.label, currentFY.fromDate, currentFY.toDate],
          ["previousFY", previousFY.label, previousFY.fromDate, previousFY.toDate],
        ] as const
      ).map(([key, label, from, to]) => (
        <Button
          key={key}
          variant={currentSelection === key ? "default" : "outline"}
          size="sm"
          className="h-11 text-base font-semibold"
          onClick={() => onSelect(from, to, key)}
        >
          {key === "currentFY" && <Calendar className="mr-1 h-4 w-4" />}
          {label}
        </Button>
      ))}
    </div>
  );
};

type ColumnDef = {
  key: string;
  header: string;
  align?: "left" | "right";
  money?: boolean;
  accent?: "orange" | "amber" | "green" | "margin";
  get: (row: ProfitAggregateRow) => string | number;
  title?: string;
};

function ProfitBreakdownTable({
  rows,
  columns,
  totals,
  emptyLabel,
  loading,
  hasGenerated,
}: {
  rows: ProfitAggregateRow[];
  columns: ColumnDef[];
  totals: ReturnType<typeof sumAggregates>;
  emptyLabel: string;
  loading: boolean;
  hasGenerated: boolean;
}) {
  const tableHeadClass = "h-12 px-4 text-sm font-bold uppercase tracking-wide text-white";
  const tableRowClass = "h-12 hover:bg-teal-50/80 dark:hover:bg-teal-950/20";
  const tableCellClass = "text-base font-medium tabular-nums";
  const tableMoneyClass = "text-right font-mono text-base font-semibold tabular-nums";
  const marginBadgeClass = "px-2.5 py-1 text-sm font-bold tabular-nums";

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasGenerated) {
    return (
      <div className="flex flex-1 items-center justify-center text-base text-muted-foreground">
        Click Generate to load profit data
      </div>
    );
  }

  const renderMoney = (value: number, accent?: ColumnDef["accent"]) => {
    if (accent === "orange") {
      return (
        <span className={cn(tableMoneyClass, "text-orange-600 dark:text-orange-400")}>
          −{formatCurrency(value)}
        </span>
      );
    }
    if (accent === "amber") {
      return (
        <span className={cn(tableMoneyClass, "text-amber-600 dark:text-amber-400")}>
          {formatCurrency(value)}
        </span>
      );
    }
    if (accent === "green") {
      return (
        <span className={cn(tableMoneyClass, "text-green-600 dark:text-green-400")}>
          {formatCurrency(value)}
        </span>
      );
    }
    return <span className={tableMoneyClass}>{formatCurrency(value)}</span>;
  };

  const renderMargin = (pct: number, destructiveWhenNegative = true) => (
    <Badge
      variant={
        pct >= 20 ? "default" : pct >= 0 || !destructiveWhenNegative ? "secondary" : "destructive"
      }
      className={marginBadgeClass}
    >
      <TrendingUp className="mr-1 h-3.5 w-3.5" />
      {pct.toFixed(1)}%
    </Badge>
  );

  return (
    <div className="net-profit-table-scroll min-h-0 flex-1 overflow-y-auto overflow-x-auto tab-scroll-stable bg-white">
      <Table className="[&_td]:px-4 [&_th]:px-4">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  tableHeadClass,
                  col.align === "right" && "text-right",
                  col.accent === "orange" && "text-orange-300",
                )}
                title={col.title}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-20 text-center text-base text-muted-foreground"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key} className={tableRowClass}>
                {columns.map((col) => {
                  if (col.accent === "margin") {
                    return (
                      <TableCell key={col.key} className="text-right">
                        {renderMargin(Number(col.get(row)))}
                      </TableCell>
                    );
                  }
                  if (col.money) {
                    return (
                      <TableCell key={col.key} className="text-right">
                        {renderMoney(Number(col.get(row)), col.accent)}
                        {col.key === "cogs" && row.zeroCostQty > 0 && (
                          <span
                            className="ml-1 text-sm text-amber-700 dark:text-amber-300"
                            aria-hidden
                            title={`${row.zeroCostQty} qty with no purchase rate`}
                          >
                            ⚠
                          </span>
                        )}
                      </TableCell>
                    );
                  }
                  const val = col.get(row);
                  return (
                    <TableCell
                      key={col.key}
                      className={cn(
                        tableCellClass,
                        col.align === "right" && "text-right",
                        col.key === "label" && "font-semibold",
                      )}
                      title={col.key === "label" ? String(val) : undefined}
                    >
                      {val === null || val === undefined || val === "" ? "-" : val}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
        {rows.length > 0 && (
          <TableFooter className="sticky bottom-0 z-10 border-t-2 bg-slate-100 font-bold">
            <TableRow className="h-12">
              {columns.map((col, idx) => {
                if (idx === 0) {
                  return (
                    <TableCell key={col.key} className="text-base font-bold">
                      TOTAL
                    </TableCell>
                  );
                }
                if (col.accent === "margin") {
                  return (
                    <TableCell key={col.key} className="text-right">
                      <Badge
                        variant={totals.grossProfit >= 0 ? "default" : "destructive"}
                        className={marginBadgeClass}
                      >
                        {totals.marginPercent.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  );
                }
                if (col.key === "qty" || col.key === "items") {
                  return (
                    <TableCell key={col.key} className={cn(tableCellClass, "text-right font-bold")}>
                      {totals.itemsSold}
                    </TableCell>
                  );
                }
                if (col.key === "secondary" || col.key === "tertiary" || col.key === "brand") {
                  return (
                    <TableCell key={col.key} className="text-base font-bold">
                      -
                    </TableCell>
                  );
                }
                if (col.money) {
                  const map: Record<string, number> = {
                    gross: totals.grossSales,
                    discounts: totals.totalDiscounts,
                    net: totals.netSales,
                    cogs: totals.totalCOGS,
                    profit: totals.grossProfit,
                  };
                  return (
                    <TableCell key={col.key} className="text-right">
                      {renderMoney(map[col.key] ?? 0, col.accent)}
                    </TableCell>
                  );
                }
                return <TableCell key={col.key} className="text-base font-bold">-</TableCell>;
              })}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

export default function NetProfitAnalysis() {
  const { currentOrganization } = useOrganization();
  const location = useLocation();
  const { orgNavigate } = useOrgNavigation();
  const fieldLabels = useProductFieldLabels();

  const searchParams = new URLSearchParams(location.search);
  const urlFromDate = searchParams.get("from");
  const urlToDate = searchParams.get("to");

  const currentFY = getIndiaFinancialYear(0);
  const [fromDate, setFromDate] = useState(urlFromDate || currentFY.fromDate);
  const [toDate, setToDate] = useState(urlToDate || format(new Date(), "yyyy-MM-dd"));
  const [fyPreset, setFyPreset] = useState<string>(urlFromDate ? "" : "");

  const [activeTab, setActiveTab] = useState<NetProfitTab>("supplier-wise");
  const [fieldDimension, setFieldDimension] = useState<NetProfitFieldDimension>("brand");
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<ProfitDataset | null>(null);
  const [search, setSearch] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  const aggregatedRows = useMemo(() => {
    if (!dataset) return [] as ProfitAggregateRow[];
    return aggregateForTab(dataset.lines, activeTab, fieldDimension);
  }, [dataset, activeTab, fieldDimension]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregatedRows;
    return aggregatedRows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.secondary && String(r.secondary).toLowerCase().includes(q)) ||
        (r.tertiary && String(r.tertiary).toLowerCase().includes(q)),
    );
  }, [aggregatedRows, search]);

  const activeTotals = useMemo(() => sumAggregates(filteredRows), [filteredRows]);

  const handleGenerate = async () => {
    if (!currentOrganization?.id) return;
    setHasGenerated(true);
    setLoading(true);
    try {
      const data = await loadProfitDataset(currentOrganization.id, fromDate, toDate);
      setDataset(data);
      if (data.lines.length === 0) {
        toast.message("No sales or returns in the selected period");
      }
    } catch (error) {
      console.error("Error loading net profit dataset:", error);
      toast.error("Failed to load net profit data");
      setDataset(null);
    }
    setLoading(false);
  };

  const handleFYPresetSelect = (from: string, to: string, key: string) => {
    setFromDate(from);
    setToDate(to);
    setFyPreset(key);
  };

  const fieldDimOpt = FIELD_DIMENSION_OPTIONS.find((o) => o.value === fieldDimension);
  const fieldDimensionLabel = fieldDimOpt?.labelKey
    ? fieldLabels[fieldDimOpt.labelKey]
    : fieldDimOpt?.fallbackLabel || "Field";

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      toast.error("No data to export");
      return;
    }

    const sheetRows = filteredRows.map((r) => {
      const base: Record<string, string | number> = {};
      if (activeTab === "bill-wise") {
        base["Bill No"] = r.label;
        base["Date"] = r.secondary || "";
        base["Customer"] = r.tertiary || "";
      } else if (activeTab === "product-wise") {
        base["Product"] = r.label;
        base["Brand"] = r.secondary || "";
        base["Category"] = r.tertiary || "";
      } else if (activeTab === "field-wise") {
        base[fieldDimensionLabel] = r.label;
      } else if (activeTab === "customer-wise") {
        base["Customer"] = r.label;
      } else if (activeTab === "salesman-wise") {
        base["Salesman"] = r.label;
      } else {
        base["Supplier"] = r.label;
      }
      base["Items / Qty"] = r.itemsSold;
      base["Gross Sales"] = r.grossSales;
      base["Discounts"] = r.totalDiscounts;
      base["Net Sales"] = r.netSales;
      base["COGS"] = r.totalCOGS;
      base["Gross Profit"] = r.grossProfit;
      base["Margin %"] = Number(r.marginPercent.toFixed(2));
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab.slice(0, 28));
    XLSX.writeFile(
      wb,
      `net-profit-${activeTab}-${fromDate}-to-${toDate}.xlsx`,
    );
    toast.success("Excel exported");
  };

  const columnsForTab = useMemo((): ColumnDef[] => {
    const qtyHeader =
      activeTab === "product-wise" || activeTab === "field-wise" ? "Qty Sold" : "Items Sold";
    const moneyCols: ColumnDef[] = [
      { key: "items", header: qtyHeader, align: "right", get: (r) => r.itemsSold },
      { key: "gross", header: "Gross Sales", align: "right", money: true, get: (r) => r.grossSales },
      {
        key: "discounts",
        header: "Discounts",
        align: "right",
        money: true,
        accent: "orange",
        title: "Item discount + bill-level flat discount (round-off is in Net Sales)",
        get: (r) => r.totalDiscounts,
      },
      { key: "net", header: "Net Sales", align: "right", money: true, get: (r) => r.netSales },
      {
        key: "cogs",
        header: "COGS",
        align: "right",
        money: true,
        accent: "amber",
        get: (r) => r.totalCOGS,
      },
      {
        key: "profit",
        header: "Gross Profit",
        align: "right",
        money: true,
        accent: "green",
        get: (r) => r.grossProfit,
      },
      {
        key: "margin",
        header: "Margin %",
        align: "right",
        accent: "margin",
        get: (r) => r.marginPercent,
      },
    ];

    if (activeTab === "bill-wise") {
      return [
        { key: "label", header: "Bill No", get: (r) => r.label },
        { key: "secondary", header: "Date", get: (r) => r.secondary || "-" },
        { key: "tertiary", header: "Customer", get: (r) => r.tertiary || "-" },
        ...moneyCols,
      ];
    }
    if (activeTab === "product-wise") {
      return [
        { key: "label", header: "Product", get: (r) => r.label },
        { key: "brand", header: "Brand", get: (r) => r.secondary || "-" },
        ...moneyCols,
      ];
    }
    if (activeTab === "customer-wise") {
      return [{ key: "label", header: "Customer", get: (r) => r.label }, ...moneyCols];
    }
    if (activeTab === "salesman-wise") {
      return [{ key: "label", header: "Salesman", get: (r) => r.label }, ...moneyCols];
    }
    if (activeTab === "field-wise") {
      return [{ key: "label", header: fieldDimensionLabel, get: (r) => r.label }, ...moneyCols];
    }
    return [{ key: "label", header: "Supplier", get: (r) => r.label }, ...moneyCols];
  }, [activeTab, fieldDimensionLabel]);

  const searchPlaceholder =
    activeTab === "supplier-wise"
      ? "SEARCH SUPPLIER..."
      : activeTab === "product-wise"
        ? "SEARCH PRODUCT, BRAND, CATEGORY..."
        : activeTab === "bill-wise"
          ? "SEARCH BILL NO, CUSTOMER..."
          : activeTab === "customer-wise"
            ? "SEARCH CUSTOMER..."
            : activeTab === "salesman-wise"
              ? "SEARCH SALESMAN..."
              : `SEARCH ${fieldDimensionLabel.toUpperCase()}...`;

  const countLabel =
    activeTab === "supplier-wise"
      ? "suppliers"
      : activeTab === "product-wise"
        ? "products"
        : activeTab === "bill-wise"
          ? "bills"
          : activeTab === "customer-wise"
            ? "customers"
            : activeTab === "salesman-wise"
              ? "salesmen"
              : "groups";

  const kpiItems = useMemo(
    () => [
      {
        label: "Gross Sales",
        value: formatCurrency(activeTotals.grossSales),
        gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
      },
      {
        label: "Net Sales",
        value: formatCurrency(activeTotals.netSales),
        gradient: "bg-gradient-to-br from-violet-500 to-violet-600",
      },
      {
        label: "Gross Profit",
        value: formatCurrency(activeTotals.grossProfit),
        gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
      },
      {
        label: "Margin",
        value: `${activeTotals.marginPercent.toFixed(1)}%`,
        gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
      },
    ],
    [activeTotals],
  );

  const tabs: { value: NetProfitTab; label: string; icon: typeof Users }[] = [
    { value: "supplier-wise", label: "Supplier-wise", icon: Users },
    { value: "product-wise", label: "Product-wise", icon: Package },
    { value: "bill-wise", label: "Bill-wise", icon: FileText },
    { value: "customer-wise", label: "Customer-wise", icon: UserRound },
    { value: "salesman-wise", label: "Salesman-wise", icon: UserCheck },
    { value: "field-wise", label: "Field-wise", icon: Layers },
  ];

  return (
    <div className="net-profit-workspace net-profit-report flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3 print:min-h-screen print:h-auto print:overflow-visible print:bg-white print:p-4">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="print:hidden shrink-0 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 px-3 text-base"
              onClick={() => orgNavigate("/reports")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold leading-none tracking-tight text-blue-700">
                <TrendingUp className="h-6 w-6 shrink-0" />
                Net Profit Analysis
              </h1>
              <p className="mt-1.5 truncate text-base text-muted-foreground">
                {currentOrganization?.name || "Organization"} · Multi-dimension Profit Breakdown
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 border-slate-300 text-base"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 border-slate-300 text-base"
              onClick={handleExportExcel}
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        {hasGenerated && !loading && (
          <div className="grid shrink-0 grid-cols-2 gap-2 print:hidden lg:grid-cols-4">
            {kpiItems.map((item) => (
              <div
                key={item.label}
                className={cn("min-w-0 rounded-lg px-3.5 py-2.5 shadow-sm", item.gradient)}
              >
                <p className="truncate text-sm font-semibold uppercase tracking-wide leading-none text-white/85">
                  {item.label}
                </p>
                <p className="mt-1.5 truncate text-xl font-black tabular-nums leading-tight text-white sm:text-2xl">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}

        <Card className="shrink-0 rounded-lg border border-slate-200 shadow-sm print:hidden">
          <CardContent className="space-y-2 p-2.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  From
                </Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-11 w-40 border-slate-200 bg-slate-50 text-base"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  To
                </Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-11 w-40 border-slate-200 bg-slate-50 text-base"
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={loading}
                size="sm"
                className="h-11 px-5 text-base font-semibold"
              >
                {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Generate
              </Button>
              <FYPresets onSelect={handleFYPresetSelect} currentSelection={fyPreset} />
            </div>
            <p className="text-base text-muted-foreground">
              Period: {format(new Date(fromDate), "dd MMM yyyy")} –{" "}
              {format(new Date(toDate), "dd MMM yyyy")}
            </p>
          </CardContent>
        </Card>

        <div className="hidden border-b p-4 print:block">
          <div className="text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">{currentOrganization?.name || "Organization"}</h1>
            <h2 className="mt-1 text-lg font-semibold">
              Net Profit Analysis - {tabs.find((t) => t.value === activeTab)?.label}
              {activeTab === "field-wise" ? ` (${fieldDimensionLabel})` : ""}
            </h2>
            <p className="text-sm text-gray-600">
              Period: {format(new Date(fromDate), "dd MMM yyyy")} -{" "}
              {format(new Date(toDate), "dd MMM yyyy")}
            </p>
            <p className="mt-1 flex items-center justify-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              Generated: {format(new Date(), "dd MMM yyyy, hh:mm a")}
            </p>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 print:hidden">
              <Tabs
                value={activeTab}
                onValueChange={(v) => {
                  setActiveTab(v as NetProfitTab);
                  setSearch("");
                }}
              >
                <TabsList className="flex h-auto w-full max-w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="flex h-10 items-center gap-1.5 px-3 text-base font-semibold data-[state=active]:bg-white"
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 print:hidden">
                {activeTab === "field-wise" && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold text-slate-600">Group by</Label>
                    <Select
                      value={fieldDimension}
                      onValueChange={(v) => setFieldDimension(v as NetProfitFieldDimension)}
                    >
                      <SelectTrigger className="h-11 w-48 text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_DIMENSION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-base">
                            {opt.labelKey ? fieldLabels[opt.labelKey] : opt.fallbackLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="relative min-w-[200px] max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 border-slate-200 bg-slate-50 pl-10 text-base uppercase placeholder:normal-case"
                  />
                </div>
                <span className="ml-auto shrink-0 text-base font-medium tabular-nums text-muted-foreground">
                  {filteredRows.length.toLocaleString("en-IN")} {countLabel}
                </span>
              </div>
              <p className="shrink-0 px-3 py-1.5 text-sm text-muted-foreground print:hidden">
                Net sales include round-off. Refunds/returns in the period reduce sales &amp; COGS.
                Services are included (COGS 0). Discounts = item + bill flat. Generate once — tabs
                re-group in memory.
              </p>

              <ProfitBreakdownTable
                rows={filteredRows}
                columns={columnsForTab}
                totals={activeTotals}
                emptyLabel="No data available for the selected period"
                loading={loading}
                hasGenerated={hasGenerated}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
