import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CalendarIcon, Plus, Pencil, Trash2, Printer, FileDown, Search, IndianRupee, Banknote, CreditCard, Wallet } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteJournalEntryByReference,
  recordExpenseVoucherJournalEntry,
} from "@/utils/accounting/journalService";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ExpensesTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

export function ExpensesTab({ organizationId, vouchers }: ExpensesTabProps) {
  const queryClient = useQueryClient();

  // Form state
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [billNo, setBillNo] = useState("");

  // Ledger filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<any>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editCategory, setEditCategory] = useState("");
  const [editPayment, setEditPayment] = useState("cash");
  const [editAmount, setEditAmount] = useState("");
  const [editNarration, setEditNarration] = useState("");

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch expense categories (optional ledger_account_id → chart Expense)
  const { data: categories } = useQuery({
    queryKey: ["expense-categories", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, ledger_account_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: expenseChartAccounts } = useQuery({
    queryKey: ["chart-expense-accounts", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("organization_id", organizationId)
        .eq("account_type", "Expense")
        .order("account_code");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const mapCategoryLedger = useMutation({
    mutationFn: async ({
      categoryId,
      ledgerAccountId,
    }: {
      categoryId: string;
      ledgerAccountId: string | null;
    }) => {
      const { error } = await supabase
        .from("expense_categories")
        .update({
          ledger_account_id: ledgerAccountId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", categoryId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category ledger mapping saved");
      queryClient.invalidateQueries({ queryKey: ["expense-categories", organizationId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save mapping"),
  });

  // Fetch all expense vouchers
  const { data: expenseVouchers, isLoading } = useQuery({
    queryKey: ["expense-vouchers", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "expense")
        .is("deleted_at", null)
        .order("voucher_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Fetch org settings for print
  const { data: settings } = useQuery({
    queryKey: ["settings", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("business_name, address, mobile_number, accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Create expense
  const createExpense = useMutation({
    mutationFn: async () => {
      const selectedCategory = category === "__custom__" ? customCategory : category;
      if (!selectedCategory) throw new Error("Please select an expense category");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Please enter a valid amount");

      const { data: voucherNumber, error: numberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: "expense", p_date: format(voucherDate, "yyyy-MM-dd") }
      );
      if (numberError) throw numberError;

      const notesField = [paidBy && `Paid by: ${paidBy}`, billNo && `Bill#: ${billNo}`].filter(Boolean).join(" | ");

      const { data: inserted, error } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "expense",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: "expense",
          category: selectedCategory,
          description: narration || selectedCategory,
          payment_method: paymentMethod,
          total_amount: parseFloat(amount),
          notes: notesField || null,
          paid_by: paidBy || null,
          receipt_number: billNo || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { data: acctSettings } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = Boolean((acctSettings as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled);

      const categoryLedgerId =
        categories?.find((c) => c.name === selectedCategory)?.ledger_account_id ?? null;

      if (postLedger && inserted?.id) {
        try {
          await recordExpenseVoucherJournalEntry(
            inserted.id,
            organizationId,
            parseFloat(amount),
            paymentMethod,
            format(voucherDate, "yyyy-MM-dd"),
            narration || selectedCategory,
            supabase,
            categoryLedgerId
          );
        } catch (jErr) {
          await supabase.from("voucher_entries").delete().eq("id", inserted.id);
          throw jErr;
        }
      }

      // If custom category, add to expense_categories
      if (category === "__custom__" && customCategory) {
        await supabase.from("expense_categories").upsert(
          { organization_id: organizationId, name: customCategory, is_active: true },
          { onConflict: "organization_id,name" }
        );
      }
    },
    onSuccess: () => {
      toast.success("Expense recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["expense-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Update expense
  const updateExpense = useMutation({
    mutationFn: async () => {
      if (!editingVoucher) return;
      const { error } = await supabase
        .from("voucher_entries")
        .update({
          voucher_date: format(editDate, "yyyy-MM-dd"),
          category: editCategory,
          description: editNarration || editCategory,
          payment_method: editPayment,
          total_amount: parseFloat(editAmount),
        })
        .eq("id", editingVoucher.id);
      if (error) throw error;

      const { data: acctSettings } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = Boolean((acctSettings as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled);

      const editCategoryLedgerId =
        categories?.find((c) => c.name === editCategory)?.ledger_account_id ?? null;

      if (postLedger) {
        await deleteJournalEntryByReference(organizationId, "ExpenseVoucher", editingVoucher.id, supabase);
        await recordExpenseVoucherJournalEntry(
          editingVoucher.id,
          organizationId,
          parseFloat(editAmount),
          editPayment,
          format(editDate, "yyyy-MM-dd"),
          editNarration || editCategory,
          supabase,
          editCategoryLedgerId
        );
      }
    },
    onSuccess: () => {
      toast.success("Expense updated");
      queryClient.invalidateQueries({ queryKey: ["expense-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      setEditDialogOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Delete expense (soft)
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { data: acctSettings } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = Boolean((acctSettings as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled);
      if (postLedger) {
        await deleteJournalEntryByReference(organizationId, "ExpenseVoucher", id, supabase);
      }
      const { error } = await supabase
        .from("voucher_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      queryClient.invalidateQueries({ queryKey: ["expense-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      setDeleteId(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setVoucherDate(new Date());
    setCategory("");
    setCustomCategory("");
    setPaymentMethod("cash");
    setAmount("");
    setNarration("");
    setPaidBy("");
    setBillNo("");
  };

  const openEdit = (v: any) => {
    setEditingVoucher(v);
    setEditDate(new Date(v.voucher_date));
    setEditCategory(v.category || v.description || "");
    setEditPayment(v.payment_method || "cash");
    setEditAmount(String(v.total_amount));
    setEditNarration(v.description || "");
    setEditDialogOpen(true);
  };

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    if (!expenseVouchers) return [];
    return expenseVouchers.filter((v) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          (v.category || "").toLowerCase().includes(q) ||
          (v.description || "").toLowerCase().includes(q) ||
          (v.voucher_number || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (filterDateFrom && new Date(v.voucher_date) < filterDateFrom) return false;
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59);
        if (new Date(v.voucher_date) > to) return false;
      }
      if (filterCategory !== "all" && (v.category || v.description) !== filterCategory) return false;
      if (filterPayment !== "all" && v.payment_method !== filterPayment) return false;
      return true;
    });
  }, [expenseVouchers, searchQuery, filterDateFrom, filterDateTo, filterCategory, filterPayment]);

  // Today's summary
  const todaySummary = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayExpenses = (expenseVouchers || []).filter((v) => v.voucher_date === today);
    const total = todayExpenses.reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const cash = todayExpenses.filter((v) => v.payment_method === "cash").reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const upi = todayExpenses.filter((v) => v.payment_method === "upi").reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const other = total - cash - upi;
    return { total, cash, upi, other, count: todayExpenses.length };
  }, [expenseVouchers]);

  // Unique categories from data
  const uniqueCategories = useMemo(() => {
    if (!expenseVouchers) return [];
    const cats = new Set(expenseVouchers.map((v) => v.category || v.description).filter(Boolean));
    return Array.from(cats).sort();
  }, [expenseVouchers]);

  const exportExcel = () => {
    const data = filteredExpenses.map((v) => ({
      "Voucher No": v.voucher_number,
      Date: format(new Date(v.voucher_date), "dd/MM/yyyy"),
      Category: v.category || v.description || "",
      Narration: v.description || "",
      Payment: v.payment_method || "",
      Amount: v.total_amount,
      "Paid By": v.paid_by || "",
      "Bill/Receipt No": v.receipt_number || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `Expenses_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const printVoucher = (v: any) => {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`
      <html><head><title>Expense Voucher</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 380px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
        .header h2 { margin: 0; font-size: 16px; }
        .header h3 { margin: 5px 0; font-size: 13px; letter-spacing: 2px; color: #555; }
        .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 15px; }
        .details { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 10px 0; }
        .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
        .row .label { color: #666; }
        .amount-box { text-align: center; margin: 15px 0; padding: 10px; border: 2px solid #333; font-size: 18px; font-weight: bold; }
        .footer { margin-top: 40px; font-size: 11px; display: flex; justify-content: space-between; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      <div class="header">
        <h2>${settings?.business_name || "Business"}</h2>
        <h3>EXPENSE VOUCHER</h3>
      </div>
      <div class="meta">
        <span>Voucher No: <b>${v.voucher_number}</b></span>
        <span>Date: <b>${format(new Date(v.voucher_date), "dd/MM/yyyy")}</b></span>
      </div>
      <div class="details">
        <div class="row"><span class="label">Category:</span><span>${v.category || v.description || "—"}</span></div>
        <div class="row"><span class="label">Narration:</span><span>${v.description || "—"}</span></div>
        <div class="row"><span class="label">Payment By:</span><span>${(v.payment_method || "cash").replace("_", " ").toUpperCase()}</span></div>
        <div class="row"><span class="label">Paid By:</span><span>${v.paid_by || "—"}</span></div>
        <div class="row"><span class="label">Bill/Ref No:</span><span>${v.receipt_number || "—"}</span></div>
      </div>
      <div class="amount-box">AMOUNT: ₹${Number(v.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
      <div class="footer">
        <span>Prepared By: ____________</span>
        <span>Authorized Signatory: ____________</span>
      </div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Today's Expenses", value: todaySummary.total, icon: IndianRupee, color: "text-destructive", sub: `${todaySummary.count} entries` },
          { label: "Cash Out", value: todaySummary.cash, icon: Banknote, color: "text-emerald-600", sub: "Cash payments" },
          { label: "UPI Out", value: todaySummary.upi, icon: Wallet, color: "text-violet-600", sub: "UPI payments" },
          { label: "Other", value: todaySummary.other, icon: CreditCard, color: "text-blue-600", sub: "Card/Bank/Cheque" },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                <c.icon className={cn("h-4 w-4", c.color)} />
              </div>
              <p className={cn("text-xl font-bold tabular-nums mt-1", c.color)}>{fmt(c.value)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entry Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Record Expense</CardTitle>
          <CardDescription className="text-xs">Enter business expense details</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createExpense.mutate();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Date */}
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left text-xs h-9">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {format(voucherDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={voucherDate} onSelect={(d) => d && setVoucherDate(d)} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Category */}
              <div className="space-y-1">
                <Label className="text-xs">Expense Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories || []).map((c) => (
                      <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>
                    ))}
                    <SelectItem value="__custom__" className="text-xs text-primary">+ Add New Category</SelectItem>
                  </SelectContent>
                </Select>
                {category === "__custom__" && (
                  <Input placeholder="Enter new category name" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="h-8 text-xs mt-1" />
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <Label className="text-xs">Amount (₹)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="h-9 text-xs" />
              </div>

              {/* Narration */}
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Narration / Notes</Label>
                <Input placeholder="What was this expense for?" value={narration} onChange={(e) => setNarration(e.target.value)} className="h-9 text-xs" />
              </div>

              {/* Paid By */}
              <div className="space-y-1">
                <Label className="text-xs">Paid By (optional)</Label>
                <Input placeholder="Staff name" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="h-9 text-xs" />
              </div>

              {/* Bill No */}
              <div className="space-y-1">
                <Label className="text-xs">Bill/Receipt No (optional)</Label>
                <Input placeholder="External ref" value={billNo} onChange={(e) => setBillNo(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>

            <Button type="submit" size="sm" className="gap-1.5" disabled={createExpense.isPending}>
              <Plus className="h-3.5 w-3.5" />
              {createExpense.isPending ? "Recording..." : "Record Expense"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Category → ledger (GL) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Category ledger accounts</CardTitle>
          <CardDescription className="text-xs">
            Map each expense category to a Chart of Accounts expense ledger. Unmapped categories use{" "}
            <span className="font-medium">6000 General Expenses</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto max-h-[280px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Post debits to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(categories || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs text-muted-foreground py-6 text-center">
                      No categories yet. Record an expense or use default categories.
                    </TableCell>
                  </TableRow>
                ) : (
                  (categories || []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-medium">{row.name}</TableCell>
                      <TableCell className="text-xs">
                        <Select
                          value={row.ledger_account_id ?? "__default__"}
                          onValueChange={(v) =>
                            mapCategoryLedger.mutate({
                              categoryId: row.id,
                              ledgerAccountId: v === "__default__" ? null : v,
                            })
                          }
                          disabled={mapCategoryLedger.isPending}
                        >
                          <SelectTrigger className="h-8 text-xs w-full max-w-[280px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__" className="text-xs">
                              Default (6000 General Expenses)
                            </SelectItem>
                            {(expenseChartAccounts || []).map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-xs">
                                {a.account_code} — {a.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Expense Ledger */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <CardTitle className="text-base">Expense Ledger</CardTitle>
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5 text-xs">
              <FileDown className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 pl-8 text-xs" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {filterDateFrom ? format(filterDateFrom, "dd/MM") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {filterDateTo ? format(filterDateTo, "dd/MM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                {uniqueCategories.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPayment} onValueChange={setFilterPayment}>
              <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Methods</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterDateFrom || filterDateTo || filterCategory !== "all" || filterPayment !== "all" || searchQuery) && (
              <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => { setSearchQuery(""); setFilterDateFrom(undefined); setFilterDateTo(undefined); setFilterCategory("all"); setFilterPayment("all"); }}>
                Clear
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[120px]">Voucher No</TableHead>
                  <TableHead className="text-xs w-[90px]">Date</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Narration</TableHead>
                  <TableHead className="text-xs w-[80px]">Payment</TableHead>
                  <TableHead className="text-xs text-right w-[100px]">Amount</TableHead>
                  <TableHead className="text-xs w-[100px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-xs py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredExpenses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-xs py-8 text-muted-foreground">No expenses found</TableCell></TableRow>
                ) : (
                  filteredExpenses.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-xs font-medium">{v.voucher_number}</TableCell>
                      <TableCell className="text-xs">{format(new Date(v.voucher_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-xs">{v.category || v.description || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{v.description || "—"}</TableCell>
                      <TableCell className="text-xs capitalize">{(v.payment_method || "cash").replace("_", " ")}</TableCell>
                      <TableCell className="text-xs text-right font-semibold tabular-nums">₹{Number(v.total_amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => printVoucher(v)}><Printer className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {filteredExpenses.length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5} className="text-xs text-right">Total ({filteredExpenses.length} entries)</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">₹{filteredExpenses.reduce((s, v) => s + Number(v.total_amount || 0), 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Expense</DialogTitle>
            <DialogDescription className="text-xs">Voucher: {editingVoucher?.voucher_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-xs h-9">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />{format(editDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editDate} onSelect={(d) => d && setEditDate(d)} className="pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select value={editPayment} onValueChange={setEditPayment}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Narration</Label>
              <Input value={editNarration} onChange={(e) => setEditNarration(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => updateExpense.mutate()} disabled={updateExpense.isPending}>
              {updateExpense.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete Expense?</DialogTitle>
            <DialogDescription className="text-xs">This expense voucher will be moved to the recycle bin.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteId && deleteExpense.mutate(deleteId)} disabled={deleteExpense.isPending}>
              {deleteExpense.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
