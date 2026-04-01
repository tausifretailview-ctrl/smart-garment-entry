import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackToDashboard } from "@/components/BackToDashboard";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, startOfDay, endOfDay } from "date-fns";
import { IndianRupee, TrendingUp, CheckCircle, Clock, Download, Plus, Trash2, BarChart3, Award, Loader2 } from "lucide-react";

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

  // Rules dialog
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

  const filteredCommissions = useMemo(() => {
    let list = commissions;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter((c: any) =>
        c.employee_name?.toLowerCase().includes(q) ||
        c.sale_number?.toLowerCase().includes(q) ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.product_name?.toLowerCase().includes(q) ||
        c.brand?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [commissions, txSearch]);

  // Summary
  const totalCommission = commissions.reduce((s: number, c: any) => s + (c.commission_amount || 0), 0);
  const pendingCommission = commissions.filter((c: any) => c.payment_status === "pending").reduce((s: number, c: any) => s + (c.commission_amount || 0), 0);
  const paidCommission = commissions.filter((c: any) => c.payment_status === "paid").reduce((s: number, c: any) => s + (c.commission_amount || 0), 0);
  const totalSales = commissions.reduce((s: number, c: any) => s + (c.sale_amount || 0), 0);
  const avgRate = totalSales > 0 ? (totalCommission / totalSales) * 100 : 0;

  // Per-salesman summary
  const salesmanSummary = useMemo(() => {
    const map: Record<string, any> = {};
    commissions.forEach((c: any) => {
      if (!map[c.employee_name]) map[c.employee_name] = { name: c.employee_name, sales: 0, commission: 0, pending: 0, paid: 0, txCount: 0 };
      map[c.employee_name].sales += c.sale_amount || 0;
      map[c.employee_name].commission += c.commission_amount || 0;
      if (c.payment_status === "pending") map[c.employee_name].pending += c.commission_amount || 0;
      if (c.payment_status === "paid") map[c.employee_name].paid += c.commission_amount || 0;
      map[c.employee_name].txCount++;
    });
    return Object.values(map).sort((a: any, b: any) => b.commission - a.commission);
  }, [commissions]);

  // Mutations
  const saveRule = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id || !ruleEmployee) throw new Error("Missing data");
      const emp = employees.find((e: any) => e.id === ruleEmployee);
      const payload = {
        organization_id: currentOrganization.id,
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
      toast({ title: editingRule ? "Rule updated" : "Rule created" });
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
      const { error } = await (supabase.from("salesman_commissions" as any) as any).update({ payment_status: "paid", paid_date: new Date().toISOString().split("T")[0] }).in("id", ids);
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

  const exportToExcel = () => {
    const data = filteredCommissions.map((c: any) => ({
      "Date": c.sale_date,
      "Invoice": c.sale_number,
      "Salesman": c.employee_name,
      "Customer": c.customer_name,
      "Product": c.product_name || "-",
      "Brand": c.brand || "-",
      "Sale Amount": c.sale_amount,
      "Commission %": c.commission_percent,
      "Commission ₹": c.commission_amount,
      "Rule": c.rule_type,
      "Status": c.payment_status,
    }));
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

  return (
    <div className="w-full px-6 py-6 space-y-6">
      <BackToDashboard />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-bold text-foreground">Salesman Commission</h1>
          <Badge variant="outline" className="text-xs">{commissions.length} records</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36 h-9 text-sm no-uppercase" />
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36 h-9 text-sm no-uppercase" />
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><IndianRupee className="h-3.5 w-3.5" />Total Sales</div>
            <p className="text-lg font-bold text-foreground">{fmt(totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" />Total Commission</div>
            <p className="text-lg font-bold text-foreground">{fmt(totalCommission)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock className="h-3.5 w-3.5" />Pending</div>
            <p className="text-lg font-bold text-amber-600">{fmt(pendingCommission)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CheckCircle className="h-3.5 w-3.5" />Paid</div>
            <p className="text-lg font-bold text-emerald-600">{fmt(paidCommission)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Award className="h-3.5 w-3.5" />Avg Rate</div>
            <p className="text-lg font-bold text-foreground">{avgRate.toFixed(2)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Salesman-wise Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {salesmanSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No commission data for this period</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesman</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesmanSummary.map((s: any) => (
                      <TableRow key={s.name}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{fmt(s.sales)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(s.commission)}</TableCell>
                        <TableCell className="text-right text-amber-600">{fmt(s.pending)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{fmt(s.paid)}</TableCell>
                        <TableCell className="text-right">{s.txCount}</TableCell>
                        <TableCell className="text-right">
                          {s.pending > 0 && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                              const pendingIds = commissions.filter((c: any) => c.employee_name === s.name && c.payment_status === "pending").map((c: any) => c.id);
                              if (pendingIds.length > 0) markPaid.mutate(pendingIds);
                            }}>
                              <CheckCircle className="h-3 w-3 mr-1" />Mark Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Commission Rules</CardTitle>
              <Button size="sm" onClick={() => { resetRuleForm(); setShowRuleDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : rules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No custom rules. Default employee commission % will be used.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesman</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="text-right">Rate %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.employee_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.rule_type}</Badge></TableCell>
                        <TableCell>{r.rule_value || "All"}</TableCell>
                        <TableCell className="text-right font-semibold">{r.commission_percent}%</TableCell>
                        <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.notes || "-"}</TableCell>
                        <TableCell className="text-right">
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <CardTitle className="text-base shrink-0">Commission Records</CardTitle>
                <Input placeholder="Search..." value={txSearch} onChange={e => setTxSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
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
              </div>
              <Button size="sm" variant="outline" onClick={exportToExcel}>
                <Download className="h-4 w-4 mr-1" />Export
              </Button>
            </CardHeader>
            <CardContent>
              {commissionsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredCommissions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No commission records found</p>
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Salesman</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead className="text-right">Sale ₹</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Commission ₹</TableHead>
                        <TableHead>Rule</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCommissions.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{c.sale_date}</TableCell>
                          <TableCell className="text-xs font-mono">{c.sale_number}</TableCell>
                          <TableCell className="font-medium text-sm">{c.employee_name}</TableCell>
                          <TableCell className="text-sm">{c.customer_name || "-"}</TableCell>
                          <TableCell className="text-xs">{c.product_name || "-"}</TableCell>
                          <TableCell className="text-xs">{c.brand || "-"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(c.sale_amount)}</TableCell>
                          <TableCell className="text-right text-sm">{c.commission_percent}%</TableCell>
                          <TableCell className="text-right font-semibold text-sm">{fmt(c.commission_amount)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{c.rule_type}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={c.payment_status === "paid" ? "default" : "secondary"} className={c.payment_status === "pending" ? "bg-amber-100 text-amber-800 border-amber-200" : ""}>
                              {c.payment_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compare Tab */}
        <TabsContent value="compare">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Salesman Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {salesmanSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data to compare</p>
              ) : (
                <div className="space-y-4">
                  {salesmanSummary.map((s: any, i: number) => {
                    const maxSale = Math.max(...salesmanSummary.map((x: any) => x.sales));
                    const maxComm = Math.max(...salesmanSummary.map((x: any) => x.commission));
                    const saleWidth = maxSale > 0 ? (s.sales / maxSale) * 100 : 0;
                    const commWidth = maxComm > 0 ? (s.commission / maxComm) * 100 : 0;
                    return (
                      <div key={s.name} className="space-y-1.5 p-3 border border-border rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground">{i + 1}. {s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.txCount} bills</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Sales</span>
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${saleWidth}%` }} />
                            </div>
                            <span className="text-xs font-semibold w-24 text-right">{fmt(s.sales)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Comm.</span>
                            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${commWidth}%` }} />
                            </div>
                            <span className="text-xs font-semibold w-24 text-right">{fmt(s.commission)}</span>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Effective Rate: <strong className="text-foreground">{s.sales > 0 ? ((s.commission / s.sales) * 100).toFixed(2) : 0}%</strong></span>
                          <span>Pending: <strong className="text-amber-600">{fmt(s.pending)}</strong></span>
                          <span>Paid: <strong className="text-emerald-600">{fmt(s.paid)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={v => { if (!v) resetRuleForm(); else setShowRuleDialog(true); }}>
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
              <Select value={ruleType} onValueChange={v => { setRuleType(v); setRuleValue(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
              <Input type="number" min="0" max="100" step="0.1" value={rulePercent} onChange={e => setRulePercent(parseFloat(e.target.value) || 0)} className="w-28" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={ruleNotes} onChange={e => setRuleNotes(e.target.value)} placeholder="Optional notes..." />
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
