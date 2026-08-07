import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationData } from "@/hooks/useOrganizationData";
import { BackToDashboard } from "@/components/BackToDashboard";
import { QuietRefreshBar } from "@/components/QuietRefreshBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Download, Search, Clock } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, format, startOfDay } from "date-fns";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
  InsightsTableSkeleton,
} from "@/components/business-insights/insightsLayout";

interface BatchRow {
  id: string;
  bill_number: string;
  purchase_date: string;
  quantity: number;
  purchase_bill_id: string | null;
  variant_id: string;
  product_variants: {
    size: string;
    color: string | null;
    barcode: string | null;
    mrp: number;
    pur_price: number;
    product_id: string;
    products: {
      product_name: string;
      brand: string | null;
    } | null;
  } | null;
  purchase_bills: {
    supplier_name: string;
  } | null;
}

function getAgeBucket(days: number): string {
  if (days <= 30) return "0-30d";
  if (days <= 60) return "31-60d";
  if (days <= 90) return "61-90d";
  return "90d+";
}

function getBucketVariant(bucket: string) {
  switch (bucket) {
    case "0-30d": return "success-outline" as const;
    case "31-60d": return "info" as const;
    case "61-90d": return "warning-outline" as const;
    case "90d+": return "destructive-outline" as const;
    default: return "outline" as const;
  }
}

const PAGE_SIZE = 200;
const BUCKET_BAR_COLORS: Record<string, string> = {
  "0-30d": "#10b981",
  "31-60d": "#0ea5e9",
  "61-90d": "#f59e0b",
  "90d+": "#ef4444",
};

export default function StockAgeingReport() {
  const { organizationId, isReady } = useOrganizationData();
  const reduceMotion = usePrefersReducedMotion();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("30");
  const [brandFilter, setBrandFilter] = useState("all");
  const [page, setPage] = useState(0);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.stockAgeing,
    organizationId,
    useMemo(
      () => ({ search, supplierFilter, ageFilter, brandFilter, page }),
      [search, supplierFilter, ageFilter, brandFilter, page],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["search", setSearch],
          ["supplierFilter", setSupplierFilter],
          ["ageFilter", setAgeFilter],
          ["brandFilter", setBrandFilter],
        ],
        numbers: [["page", setPage]],
      });
    },
  );

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["stock-ageing", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      let allRows: BatchRow[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("batch_stock")
          .select(`
            id, bill_number, purchase_date, quantity, purchase_bill_id, variant_id,
            product_variants!inner(size, color, barcode, mrp, pur_price, product_id,
              products!inner(product_name, brand)
            ),
            purchase_bills(supplier_name)
          `)
          .eq("organization_id", organizationId)
          .gt("quantity", 0)
          .order("purchase_date", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        if (data) allRows = allRows.concat(data as unknown as BatchRow[]);
        hasMore = (data?.length || 0) === 1000;
        from += 1000;
      }
      return allRows;
    },
    enabled: isReady,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false as const,
    refetchOnMount: false as const,
    refetchOnReconnect: false as const,
  });

  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");

  const enrichedData = useMemo(() => {
    if (!rawData) return [];
    const today = startOfDay(new Date(`${todayKey}T00:00:00`));
    return rawData.map((row) => {
      const ageDays = differenceInDays(today, new Date(row.purchase_date));
      return {
        ...row,
        ageDays,
        bucket: getAgeBucket(ageDays),
        productName: row.product_variants?.products?.product_name || "",
        brand: row.product_variants?.products?.brand || "",
        size: row.product_variants?.size || "",
        barcode: row.product_variants?.barcode || "",
        mrp: row.product_variants?.mrp || 0,
        purchasePrice: row.product_variants?.pur_price || 0,
        supplier: row.purchase_bills?.supplier_name || "N/A",
      };
    });
  }, [rawData, todayKey]);

  const suppliers = useMemo(() => {
    const set = new Set(enrichedData.map((r) => r.supplier));
    return Array.from(set).sort();
  }, [enrichedData]);

  const brands = useMemo(() => {
    const set = new Set(enrichedData.filter((r) => r.brand).map((r) => r.brand));
    return Array.from(set).sort();
  }, [enrichedData]);

  const filtered = useMemo(() => {
    let rows = enrichedData;
    const minAge = ageFilter === "all" ? 0 : parseInt(ageFilter, 10);
    rows = rows.filter((r) => r.ageDays >= minAge);
    if (supplierFilter !== "all") rows = rows.filter((r) => r.supplier === supplierFilter);
    if (brandFilter !== "all") rows = rows.filter((r) => r.brand === brandFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.barcode.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.size.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [enrichedData, ageFilter, supplierFilter, brandFilter, search]);

  const summary = useMemo(() => {
    const totalValue = filtered.reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const over30 = filtered.filter((r) => r.ageDays > 30).reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const over60 = filtered.filter((r) => r.ageDays > 60).reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const over90 = filtered.filter((r) => r.ageDays > 90).reduce((s, r) => s + r.purchasePrice * r.quantity, 0);
    const totalQty = filtered.reduce((s, r) => s + r.quantity, 0);
    return { totalValue, over30, over60, over90, totalQty, count: filtered.length };
  }, [filtered]);

  const bucketChart = useMemo(() => {
    const buckets = ["0-30d", "31-60d", "61-90d", "90d+"] as const;
    return buckets.map((bucket) => {
      const rows = filtered.filter((r) => r.bucket === bucket);
      return {
        name: bucket,
        value: Math.round(rows.reduce((s, r) => s + r.purchasePrice * r.quantity, 0)),
        qty: rows.reduce((s, r) => s + r.quantity, 0),
        fill: BUCKET_BAR_COLORS[bucket],
      };
    });
  }, [filtered]);

  const paginatedRows = useMemo(() => filtered.slice(0, (page + 1) * PAGE_SIZE), [filtered, page]);
  const hasMore = paginatedRows.length < filtered.length;

  const exportToExcel = () => {
    if (!filtered.length) return toast.error("No data to export");
    const rows = filtered.map((r) => ({
      "Product Name": r.productName,
      Brand: r.brand,
      Size: r.size,
      Barcode: r.barcode,
      Supplier: r.supplier,
      "Bill No.": r.bill_number,
      "Purchase Date": format(new Date(r.purchase_date), "dd-MM-yyyy"),
      "Age (Days)": r.ageDays,
      Qty: r.quantity,
      "Purchase Value": r.purchasePrice * r.quantity,
      "Sale Value (MRP)": r.mrp * r.quantity,
      "Ageing Bucket": r.bucket,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Ageing");
    XLSX.writeFile(wb, `Stock_Ageing_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Excel exported");
  };

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  if (isLoading && !rawData) {
    return (
      <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
        <InsightsTableSkeleton columns={12} title="Loading stock ageing…" />
      </div>
    );
  }

  return (
    <div className="business-insights-workspace relative flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <QuietRefreshBar queryKey={["stock-ageing", organizationId]} />
      <div className={`${INSIGHTS_TAB_SHELL}`}>
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <BackToDashboard />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Clock className="h-5 w-5 shrink-0" />
                Stock Ageing Report
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Slow-moving inventory by purchase batch age
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportToExcel} className="h-9 gap-1.5 shrink-0">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full shrink-0">
          <InsightsKpiCard
            label="Total Aged Stock"
            value={summary.totalValue}
            valueFormat="inr"
            tone="neutral"
            sub={`${summary.totalQty.toLocaleString("en-IN")} pcs · ${summary.count} batches`}
          />
          <InsightsKpiCard
            label="> 30 Days"
            value={summary.over30}
            valueFormat="inr"
            tone="attention"
            sub="Purchase value at risk"
          />
          <InsightsKpiCard
            label="> 60 Days"
            value={summary.over60}
            valueFormat="inr"
            tone="attention"
          />
          <InsightsKpiCard
            label="> 90 Days"
            value={summary.over90}
            valueFormat="inr"
            tone="critical"
            sub="Critical ageing"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 shrink-0 min-h-0">
          <InsightsPanel title="Value by age bucket" subtitle="Purchase value in each ageing band" className="lg:col-span-1 h-[220px]">
            <div className="h-[170px] px-2 py-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bucketChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number, _n, item) => [
                      fmt(Number(value)),
                      `${item?.payload?.qty ?? 0} pcs`,
                    ]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Bar
                    dataKey="value"
                    name="Purchase value"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={!reduceMotion}
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    {bucketChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </InsightsPanel>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-sm px-3 py-2 flex flex-wrap items-center gap-2 min-h-[220px] content-start">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, barcode, brand..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={ageFilter} onValueChange={(v) => { setAgeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ages</SelectItem>
                <SelectItem value="30">&gt; 30 Days</SelectItem>
                <SelectItem value="60">&gt; 60 Days</SelectItem>
                <SelectItem value="90">&gt; 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={(v) => { setSupplierFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={(v) => { setBrandFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              Showing {paginatedRows.length.toLocaleString("en-IN")} of {filtered.length.toLocaleString("en-IN")}
            </span>
            <p className="w-full text-xs text-slate-500">
              Values use current variant purchase price × batch qty (batch cost snapshot not stored separately).
            </p>
          </div>
        </div>

        <InsightsPanel
          className="flex-1 min-h-0"
          title="Aged batches"
          subtitle="Oldest purchase batches first"
          stickyFirstColumn
          footer={
            hasMore ? (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                  Load More ({(filtered.length - paginatedRows.length).toLocaleString("en-IN")} remaining)
                </Button>
              </div>
            ) : null
          }
        >
          <Table className="w-full min-w-max">
            <InsightsTableHeader>
              <InsightsStaticTh label="Product" />
              <InsightsStaticTh label="Brand" />
              <InsightsStaticTh label="Size" />
              <InsightsStaticTh label="Barcode" />
              <InsightsStaticTh label="Supplier" />
              <InsightsStaticTh label="Bill No." />
              <InsightsStaticTh label="Purchase Date" />
              <InsightsStaticTh label="Age" className="text-right" />
              <InsightsStaticTh label="Qty" className="text-right" />
              <InsightsStaticTh label="Purchase Val." className="text-right" />
              <InsightsStaticTh label="MRP Val." className="text-right" />
              <InsightsStaticTh label="Bucket" />
            </InsightsTableHeader>
            <TableBody>
              {paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className={`${INSIGHTS_BODY_CELL} text-center py-8 text-muted-foreground`}>
                    No aged stock found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((r) => (
                  <TableRow key={r.id} className={INSIGHTS_BODY_ROW}>
                    <TableCell className={`${INSIGHTS_BODY_CELL} font-medium max-w-[200px] truncate`}>
                      {r.productName}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>{r.brand || "-"}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>{r.size}</TableCell>
                    <TableCell className={`${INSIGHTS_BODY_CELL} font-mono text-xs`}>{r.barcode || "-"}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>{r.supplier}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>{r.bill_number}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      {format(new Date(r.purchase_date), "dd-MM-yyyy")}
                    </TableCell>
                    <TableCell className={`${INSIGHTS_BODY_CELL_NUM} font-semibold`}>{r.ageDays}d</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{r.quantity}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{fmt(r.purchasePrice * r.quantity)}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{fmt(r.mrp * r.quantity)}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      <Badge variant={getBucketVariant(r.bucket)}>{r.bucket}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </InsightsPanel>
      </div>
    </div>
  );
}
