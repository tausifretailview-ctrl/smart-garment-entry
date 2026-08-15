import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, startOfDay, endOfDay } from "date-fns";
import { IndianRupee, TrendingUp, CheckCircle, Clock, Download, Plus, Trash2, BarChart3, Award, Percent } from "lucide-react";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_NEUTRAL_TH,
  INSIGHTS_TABLE_HEAD,
} from "@/components/business-insights/insightsLayout";
import {
  enrichCommissionsWithSaleItems,
  type EnrichedCommissionRow,
} from "@/utils/salesmanCommissionDisplay";

const RULE_TYPES = [
  { value: "default", label: "Default (all products)" },
  { value: "brand", label: "By Brand" },
  { value: "category", label: "By Category" },
  { value: "style", label: "By Style" },
  { value: "product", label: "By Product" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const getPeriodDates = (period: string, customStart: string, customEnd: string) => {
  const now = new Date();
  switch (period) {
    case "today": return { start: format(startOfDay(now), "yyyy-MM-dd"), end: format(endOfDay(now), "yyyy-MM-dd") };
    case "this_month": return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    case "last_month": return { start: format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd"), end: format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd") };
    case "this_quarter": return { start: format(startOfQuarter(now), "yyyy-MM-dd"), end: format(endOfQuarter(now), "yyyy-MM-dd") };
    case "this_year": return { start: format(startOfYear(now), "yyyy-MM-dd"), end: format(endOfYear(now), "yyyy-MM-dd") };
    case "custom": return { start: customStart, end: customEnd };
    default: return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
  }
};

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function SalesmanCommission() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState("this_month");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterSalesman, setFilterSalesman] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [ruleEmployee, setRuleEmployee] = useState("");
  const [ruleType, setRuleType] = useState("default");
  const [ruleValue, setRuleValue] = useState("");
  const [rulePercent, setRulePercent] = useState(1);
  const [ruleNotes, setRuleNotes] = useState("");
  const [editingRule, setEditingRule] = useState<any>(null);

  const { start, end } = getPeriodDates(period, customStart, customEnd);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-commission-page", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, employee_name, commission_percent, status, designation").eq("organization_id", currentOrganization!.id).is("deleted_at", null).eq("status", "active").order("employee_name");
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["commission-rules-page", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await (supabase.from("commission_rules" as any) as any).select("*").eq("organization_id", currentOrganization!.id).order("employee_name").order("rule_type");
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: commissions = [], isLoading: commissionsLoading } = useQuery({
    queryKey: ["salesman-commissions-page", currentOrganization?.id, start, end, filterSalesman, filterStatus],
    queryFn: async () => {
      let q = (supabase.from("salesman_commissions" as any) as any).select("*").eq("organization_id", currentOrganization!.id).gte("sale_date", start).lte("sale_date", end).order("sale_date", { ascending: false });
      if (filterSalesman !== "all") q = q.eq("employee_name", filterSalesman);
      if (filterStatus !== "all") q = q.eq("payment_status", filterStatus);
      const { data } = await q;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const saleIds = useMemo(
    () => [...new Set(commissions.map((c: any) => c.sale_id).filter(Boolean))] as string[],
    [commissions],
  );

  const { data: saleItems = [] } = useQuery({
    queryKey: ["commission-sale-items-discount", currentOrganization?.id, saleIds.join(",")],
    queryFn: async () => {
      if (saleIds.length === 0) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("sale_id, product_id, product_name, line_total, discount_share, net_after_discount, discount_percent")
        .in("sale_id", saleIds)
        .is("deleted_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && saleIds.length > 0,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-commission", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, product_name, brand, category, style").eq("organization_id", currentOrganization!.id).is("deleted_at", null).order("product_name").limit(500);
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const brands = [...new Set(products.map((p: any) => p.brand).filter(Boolean))].sort();
  const categories = [...new Set(products.map((p: any) => p.category).filter(Boolean))].sort();
  const styles = [...new Set(products.map((p: any) => p.style).filter(Boolean))].sort();

  const enrichedCommissions = useMemo(
    () => enrichCommissionsWithSaleItems(commissions, saleItems),
    [commissions, saleItems],
  );

  const filteredCommissions = useMemo(() => {
    let list = enrichedCommissions;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter((c) =>
        String(c.employee_name || "").toLowerCase().includes(q) ||
        String(c.sale_number || "").toLowerCase().includes(q) ||
        String(c.customer_name || "").toLowerCase().includes(q) ||
        String(c.product_name || "").toLowerCase().includes(q) ||
        String(c.brand || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [enrichedCommissions, txSearch]);

  const totalGross = enrichedCommissions.reduce((s, c) => s + c.grossSale, 0);
  const totalDiscount = enrichedCommissions.reduce((s, c) => s + c.discountAmount, 0);
  const totalNet = enrichedCommissions.reduce((s, c) => s + c.netSale, 0);
  const totalCommission = enrichedCommissions.reduce((s, c) => s + c.displayCommission, 0);
  const pendingCommission = enrichedCommissions
    .filter((c) => c.payment_status === "pending")
    .reduce((s, c) => s + c.displayCommission, 0);
  const paidCommission = enrichedCommissions
    .filter((c) => c.payment_status === "paid")
    .reduce((s, c) => s + c.displayCommission, 0);
  const avgRate = totalNet > 0 ? (totalCommission / totalNet) * 100 : 0;

  const salesmanSummary = useMemo(() => {
    const map: Record<string, {
      name: string;
      sales: number;
      discount: number;
      net: number;
      commission: number;
      pending: number;
      paid: number;
      txCount: number;
    }> = {};
    enrichedCommissions.forEach((c) => {
      const name = String(c.employee_name || "—");
      if (!map[name]) {
        map[name] = { name, sales: 0, discount: 0, net: 0, commission: 0, pending: 0, paid: 0, txCount: 0 };
      }
      map[name].sales += c.grossSale;
      map[name].discount += c.discountAmount;
      map[name].net += c.netSale;
      map[name].commission += c.displayCommission;
      map[name].txCount += 1;
      if (c.payment_status === "pending") map[name].pending += c.displayCommission;
      if (c.payment_status === "paid") map[name].paid += c.displayCommission;
    });
    return Object.values(map).sort((a, b) => b.commission - a.commission);
  }, [enrichedCommissions]);

  const saveRule = useMutation({
    mutationFn: async () => {
      const emp = employees.find((e: any) => e.id === ruleEmployee);
      const payload = {
        organization_id: currentOrganization!.id,
        employee_id: ruleEmployee,
        employee_name: emp?.employee_name || "",
        rule_type: ruleType,
        rule_value: ruleType === "default" ? null : ruleValue,
        commission_percent: rulePercent,
        notes: ruleNotes || null,
        is_active: true,
      };
      if (editingRule) {
        const { error } = await (supabase.from("commission_rules" as any) as any).update(payload).eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("commission_rules" as any) as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-rules-page"] });
      toast({ title: editingRule ? "Rule updated" : "Rule added" });
      resetRuleForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("commission_rules" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-rules-page"] });
      toast({ title: "Rule deleted" });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase.from("salesman_commissions" as any) as any)
        .update({ payment_status: "paid", paid_date: new Date().toISOString().split("T")[0] })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salesman-commissions-page"] });
      toast({ title: "Marked as paid" });
    },
  });

  const resetRuleForm = () => {
    setShowRuleDialog(false);
    setEditingRule(null);
    setRuleEmployee("");
    setRuleType("default");
    setRuleValue("");
    setRulePercent(1);
    setRuleNotes("");
  };

  const editRule = (rule: any) => {
    setEditingRule(rule);
    setRuleEmployee(rule.employee_id);
    setRuleType(rule.rule_type);
    setRuleValue(rule.rule_value || "");
    setRulePercent(rule.commission_percent);
    setRuleNotes(rule.notes || "");
    setShowRuleDialog(true);
  };

  const exportToExcel = async () => {
    const data = filteredCommissions.map((c: EnrichedCommissionRow) => ({
      Date: c.sale_date,
      Invoice: c.sale_number,
      Salesman: c.employee_name,
      Customer: c.customer_name,
      Product: c.product_name || "-",
      Brand: c.brand || "-",
      "Sale (Gross)": c.grossSale,
      Discount: c.discountAmount,
      "Net Sale": c.netSale,
      "Commission %": c.commission_percent,
      "Commission ₹": c.displayCommission,
      Rule: c.rule_type,
      Status: c.payment_status,
    }));
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Commission");
    XLSX.writeFile(wb, `Commission_Report_${start}_${end}.xlsx`);
  };

  const getRuleValueOptions = () => {
    switch (ruleType) {
      case "brand": return brands;
      case "category": return categories;
      case "style": return styles;
      case "product": return products.map((p: any) => ({ id: p.id, label: p.product_name }));
      default: return [];
    }
  };

  const kpiCards = [
    { label: "Gross Sales", value: fmt(totalGross), icon: IndianRupee, tone: "from-slate-600 to-slate-700" },
    { label: "Discount", value: fmt(totalDiscount), icon: Percent, tone: "from-rose-500 to-rose-600" },
    { label: "Net Sales", value: fmt(totalNet), icon: IndianRupee, tone: "from-blue-600 to-blue-700" },
    { label: "Commission", value: fmt(totalCommission), icon: TrendingUp, tone: "from-indigo-500 to-indigo-600" },
    { label: "Pending", value: fmt(pendingCommission), icon: Clock, tone: "from-amber-500 to-amber-600" },
    { label: "Paid", value: fmt(paidCommission), icon: CheckCircle, tone: "from-emerald-500 to-emerald-600" },
    { label: "Avg Rate", value: `${avgRate.toFixed(2)}%`, icon: Award, tone: "from-teal-600 to-teal-700" },
  ];

  return (
    <div className="salesman-commission-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        {/* Toolbar — Customer Balances style */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
              <TrendingUp className="h-5 w-5 shrink-0" />
              Salesman Commission
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {enrichedCommissions.length.toLocaleString("en-IN")} records · commission on{" "}
              <strong className="text-foreground">net sale after discount</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-36 h-9 text-sm no-uppercase" />
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-36 h-9 text-sm no-uppercase" />
              </>
            )}
          </div>
        </div>

        {/* Compact KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 w-full shrink-0">
          {kpiCards.map((k) => (
            <div key={k.label} className={cn("rounded-lg bg-gradient-to-br px-3 py-2 min-w-0 shadow-sm", k.tone)}>
              <p className="text-xs font-medium text-white/80 leading-none flex items-center gap-1">
                <k.icon className="h-3 w-3" />{k.label}
              </p>
              <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
                {k.value}
              </p>
            </div>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 gap-2">
          <TabsList className="h-9 shrink-0 w-fit rounded-md bg-slate-100 p-1">
            <TabsTrigger value="overview" className="rounded px-3 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700">Overview</TabsTrigger>
            <TabsTrigger value="rules" className="rounded px-3 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700">Rules</TabsTrigger>
            <TabsTrigger value="transactions" className="rounded px-3 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700">Transactions</TabsTrigger>
            <TabsTrigger value="compare" className="rounded px-3 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 flex flex-1 min-h-0 flex-col data-[state=inactive]:hidden">
            <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-2 border-b border-slate-100 bg-white shrink-0">
                <h2 className="text-sm font-semibold text-foreground">Salesman-wise Summary</h2>
              </div>
              {commissionsLoading ? (
                <div className="p-2"><ListTableSkeleton rows={8} columns={8} /></div>
              ) : salesmanSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No commission data for this period</p>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-white tab-scroll-stable">
                  <Table>
                    <TableHeader className={INSIGHTS_TABLE_HEAD}>
                      <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Salesman</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Sales</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Discount</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Net Sale</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Commission</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Pending</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Paid</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Bills</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesmanSummary.map((s) => (
                        <TableRow key={s.name} className={INSIGHTS_BODY_ROW}>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium")}>{s.name}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{fmt(s.sales)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "text-rose-600")}>{fmt(s.discount)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-semibold")}>{fmt(s.net)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-semibold")}>{fmt(s.commission)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "text-amber-600")}>{fmt(s.pending)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "text-emerald-600")}>{fmt(s.paid)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{s.txCount}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-right")}>
                            {s.pending > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  const pendingIds = enrichedCommissions
                                    .filter((c) => c.employee_name === s.name && c.payment_status === "pending")
                                    .map((c) => c.id);
                                  if (pendingIds.length > 0) markPaid.mutate(pendingIds);
                                }}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />Mark Paid
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="mt-0 flex flex-1 min-h-0 flex-col data-[state=inactive]:hidden">
            <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white shrink-0">
                <h2 className="text-sm font-semibold">Commission Rules</h2>
                <Button size="sm" className="h-8" onClick={() => { resetRuleForm(); setShowRuleDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1" />Add Rule
                </Button>
              </div>
              {rulesLoading ? (
                <div className="p-2"><ListTableSkeleton rows={5} columns={5} /></div>
              ) : rules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No custom rules. Default employee commission % will be used.</p>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto bg-white">
                  <Table>
                    <TableHeader className={INSIGHTS_TABLE_HEAD}>
                      <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Salesman</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Type</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Value</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Rate %</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Status</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Notes</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((r: any) => (
                        <TableRow key={r.id} className={INSIGHTS_BODY_ROW}>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium")}>{r.employee_name}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}><Badge variant="outline" className="text-xs">{r.rule_type}</Badge></TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{r.rule_value || "All"}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-semibold")}>{r.commission_percent}%</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs text-muted-foreground")}>{r.notes || "-"}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-right")}>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => editRule(r)}>Edit</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => { if (confirm("Delete this rule?")) deleteRule.mutate(r.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="mt-0 flex flex-1 min-h-0 flex-col data-[state=inactive]:hidden">
            <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
                <h2 className="text-sm font-semibold shrink-0">Commission Records</h2>
                <Input placeholder="Search..." value={txSearch} onChange={(e) => setTxSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
                <Select value={filterSalesman} onValueChange={setFilterSalesman}>
                  <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All Salesmen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Salesmen</SelectItem>
                    {employees.map((e: any) => <SelectItem key={e.id} value={e.employee_name}>{e.employee_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-9 ml-auto" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-1" />Export
                </Button>
              </div>
              {commissionsLoading ? (
                <div className="p-2"><ListTableSkeleton rows={8} columns={8} /></div>
              ) : filteredCommissions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No commission records found</p>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-white tab-scroll-stable">
                  <Table>
                    <TableHeader className={INSIGHTS_TABLE_HEAD}>
                      <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Date</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Invoice</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Salesman</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Customer</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Product</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Sale</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Discount</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Net</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Rate</TableHead>
                        <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Commission</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Rule</TableHead>
                        <TableHead className={INSIGHTS_NEUTRAL_TH}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCommissions.map((c) => (
                        <TableRow key={c.id} className={INSIGHTS_BODY_ROW}>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs")}>{String(c.sale_date || "")}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs font-mono")}>{String(c.sale_number || "")}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium text-sm")}>{String(c.employee_name || "")}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-sm")}>{String(c.customer_name || "-")}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "text-xs")}>{String(c.product_name || "-")}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{fmt(c.grossSale)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "text-rose-600")}>{fmt(c.discountAmount)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-medium")}>{fmt(c.netSale)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{c.commission_percent}%</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-semibold")}>{fmt(c.displayCommission)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}><Badge variant="outline" className="text-[10px]">{String(c.rule_type || "")}</Badge></TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>
                            <Badge
                              variant={c.payment_status === "paid" ? "default" : "secondary"}
                              className={c.payment_status === "pending" ? "bg-amber-100 text-amber-800 border-amber-200" : ""}
                            >
                              {String(c.payment_status || "")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="mt-0 flex flex-1 min-h-0 flex-col data-[state=inactive]:hidden">
            <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-2 border-b border-slate-100 bg-white shrink-0">
                <h2 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" />Salesman Comparison</h2>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {salesmanSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No data to compare</p>
                ) : (
                  salesmanSummary.map((s, i) => {
                    const maxNet = Math.max(...salesmanSummary.map((x) => x.net));
                    const maxComm = Math.max(...salesmanSummary.map((x) => x.commission));
                    const netWidth = maxNet > 0 ? (s.net / maxNet) * 100 : 0;
                    const commWidth = maxComm > 0 ? (s.commission / maxComm) * 100 : 0;
                    return (
                      <div key={s.name} className="space-y-1.5 p-3 border border-border rounded-lg bg-white">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground">{i + 1}. {s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.txCount} bills</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Net</span>
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${netWidth}%` }} />
                            </div>
                            <span className="text-xs font-semibold w-24 text-right tabular-nums">{fmt(s.net)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Disc.</span>
                            <span className="text-xs font-semibold text-rose-600 tabular-nums">{fmt(s.discount)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Comm.</span>
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${commWidth}%` }} />
                            </div>
                            <span className="text-xs font-semibold w-24 text-right tabular-nums">{fmt(s.commission)}</span>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Rate on net: <strong className="text-foreground">{s.net > 0 ? ((s.commission / s.net) * 100).toFixed(2) : 0}%</strong></span>
                          <span>Pending: <strong className="text-amber-600">{fmt(s.pending)}</strong></span>
                          <span>Paid: <strong className="text-emerald-600">{fmt(s.paid)}</strong></span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showRuleDialog} onOpenChange={(v) => { if (!v) resetRuleForm(); else setShowRuleDialog(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Add Commission Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Salesman *</Label>
              <Select value={ruleEmployee} onValueChange={setRuleEmployee}>
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.employee_name} ({(e.commission_percent ?? 1)}% default)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rule Type</Label>
              <Select value={ruleType} onValueChange={(v) => { setRuleType(v); setRuleValue(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {ruleType !== "default" && (
              <div>
                <Label>Value</Label>
                {ruleType === "product" ? (
                  <Select value={ruleValue} onValueChange={setRuleValue}>
                    <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                    <SelectContent>
                      {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={ruleValue} onValueChange={setRuleValue}>
                    <SelectTrigger><SelectValue placeholder={`Select ${ruleType}...`} /></SelectTrigger>
                    <SelectContent>
                      {(getRuleValueOptions() as string[]).map((v: string) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <div>
              <Label>Commission %</Label>
              <Input type="number" min="0" max="100" step="0.1" value={rulePercent} onChange={(e) => setRulePercent(parseFloat(e.target.value) || 0)} className="w-28" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={ruleNotes} onChange={(e) => setRuleNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetRuleForm}>Cancel</Button>
            <Button onClick={() => saveRule.mutate()} disabled={!ruleEmployee || (ruleType !== "default" && !ruleValue)}>
              {editingRule ? "Update" : "Save"} Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
