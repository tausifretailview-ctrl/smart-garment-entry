import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Coins, Plus, Search, RefreshCw, Undo2, IndianRupee, TrendingUp, Wallet, ChevronLeft, ChevronRight, Pencil, Printer, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { AdvanceBookingReceipt } from "@/components/AdvanceBookingReceipt";
import { useReactToPrint } from "react-to-print";
import { useSettings } from "@/hooks/useSettings";
import { useSearchParams } from "react-router-dom";
import {
  deleteJournalEntryByReference,
  recordCustomerAdvanceRefundJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

const PAGE_SIZE = 50;

type DateFilter = "all" | "today" | "week" | "month";
type StatusFilter = "all" | "active" | "partially_used" | "fully_used" | "refunded";

export default function AdvanceBookingDashboard() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
   const [addDialogOpen, setAddDialogOpen] = useState(false);
   const [refundDialogOpen, setRefundDialogOpen] = useState(false);
   const [editDialogOpen, setEditDialogOpen] = useState(false);
   const [selectedAdvance, setSelectedAdvance] = useState<any>(null);
   const [refundAmount, setRefundAmount] = useState("");
   const [refundMethod, setRefundMethod] = useState("cash");
   const [refundReason, setRefundReason] = useState("");
   const [editAmount, setEditAmount] = useState("");
   const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
   const [editDescription, setEditDescription] = useState("");
   const [editChequeNumber, setEditChequeNumber] = useState("");
   const [editTransactionId, setEditTransactionId] = useState("");
   const [showCustomerHistory, setShowCustomerHistory] = useState(false);
   const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
   const [printAdvance, setPrintAdvance] = useState<any>(null);
   const [printPaperSize, setPrintPaperSize] = useState<"A4" | "A5">("A5");
   const [printDialogOpen, setPrintDialogOpen] = useState(false);
   const dashPrintRef = useRef<HTMLDivElement>(null);
   const { data: settings } = useSettings();
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

   const handleDashPrint = useReactToPrint({
     contentRef: dashPrintRef,
     documentTitle: `Advance-${printAdvance?.advance_number || "Receipt"}`,
     onAfterPrint: () => {
       setPrintDialogOpen(false);
       setPrintAdvance(null);
     },
   });

   const openPrintDialog = (adv: any) => {
     setPrintAdvance(adv);
     setPrintDialogOpen(true);
   };

   const dashCompanyDetails = {
     businessName: (settings as any)?.business_name || currentOrganization?.name || "Business",
     address: (settings as any)?.address || "",
     phone: (settings as any)?.mobile_number || "",
     email: (settings as any)?.email_id || "",
     gstNumber: (settings as any)?.gst_number || "",
   };

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
    const timeout = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timeout);
  }, []);

  // Pre-fill search from URL query param (e.g., from Customer Ledger refund shortcut)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch) {
      setSearch(urlSearch);
      setDebouncedSearch(urlSearch);
    }
  }, []);

  // Date range helper
  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case "today": return startOfDay(now).toISOString();
      case "week": return startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      case "month": return startOfMonth(now).toISOString();
      default: return null;
    }
  };

  // Summary cards query (lightweight)
  const { data: summary } = useQuery({
    queryKey: ["advance-summary", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("amount, used_amount, status")
        .eq("organization_id", orgId!);
      if (error) throw error;
      
      const total = data?.length || 0;
      const totalAmount = data?.reduce((s, a) => s + (a.amount || 0), 0) || 0;
      const usedAmount = data?.reduce((s, a) => s + (a.used_amount || 0), 0) || 0;
      return { total, totalAmount, usedAmount, available: totalAmount - usedAmount };
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  // Paginated advances query
  const { data: advancesData, isLoading } = useQuery({
    queryKey: ["advance-dashboard", orgId, debouncedSearch, dateFilter, statusFilter, currentPage],
    queryFn: async () => {
      // If searching by customer name/phone, first find matching customer IDs
      let customerIds: string[] | null = null;
      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        const { data: matchedCustomers } = await supabase
          .from("customers")
          .select("id")
          .eq("organization_id", orgId!)
          .or(`customer_name.ilike.${term},phone.ilike.${term}`)
          .limit(200);
        customerIds = matchedCustomers?.map(c => c.id) || [];
      }

      let query = supabase
        .from("customer_advances")
        .select("*, customers(customer_name, phone)", { count: "exact" })
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });

      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        if (customerIds && customerIds.length > 0) {
          // Search by advance number OR matching customer IDs
          query = query.or(`advance_number.ilike.${term},customer_id.in.(${customerIds.join(",")})`);
        } else {
          // No matching customers, just search by advance number
          query = query.ilike("advance_number", term);
        }
      }

      const dateFrom = getDateRange();
      if (dateFrom) {
        query = query.gte("advance_date", dateFrom);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const offset = (currentPage - 1) * PAGE_SIZE;
      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const advances = advancesData?.data || [];
  const totalCount = advancesData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async ({ advanceId, amount, method, reason }: { advanceId: string; amount: number; method: string; reason: string }) => {
      const { data: adv, error: fetchErr } = await supabase
        .from("customer_advances")
        .select("amount, used_amount, status")
        .eq("id", advanceId)
        .single();
      if (fetchErr) throw fetchErr;

      const available = (adv.amount || 0) - (adv.used_amount || 0);
      if (amount > available) throw new Error("Refund amount exceeds available balance");

      const snapUsed = Number(adv.used_amount || 0);
      const snapStatus = String(adv.status || "active");
      const newUsed = snapUsed + amount;
      const newStatus = amount >= available ? "refunded" : "partially_used";

      const refundYmd = format(new Date(), "yyyy-MM-dd");
      const { data: refundRow, error: refundErr } = await supabase
        .from("advance_refunds")
        .insert({
          organization_id: orgId!,
          advance_id: advanceId,
          refund_amount: amount,
          payment_method: method,
          reason: reason || null,
          created_by: user?.id || null,
          refund_date: refundYmd,
        })
        .select("id")
        .single();
      if (refundErr) throw refundErr;
      const refundId = refundRow?.id as string | undefined;
      if (!refundId) throw new Error("Refund record not created");

      const { error: updateErr } = await supabase
        .from("customer_advances")
        .update({ used_amount: newUsed, status: newStatus })
        .eq("id", advanceId);
      if (updateErr) {
        await supabase.from("advance_refunds").delete().eq("id", refundId);
        throw updateErr;
      }

      const { data: acctRef } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", orgId!)
        .maybeSingle();
      if (
        isAccountingEngineEnabled(acctRef as { accounting_engine_enabled?: boolean } | null)
      ) {
        try {
          await recordCustomerAdvanceRefundJournalEntry(
            refundId,
            orgId!,
            amount,
            method,
            refundYmd,
            reason?.trim() || `Advance refund`,
            supabase
          );
        } catch (glErr) {
          await deleteJournalEntryByReference(
            orgId!,
            "CustomerAdvanceRefund",
            refundId,
            supabase
          );
          await supabase
            .from("customer_advances")
            .update({ used_amount: snapUsed, status: snapStatus })
            .eq("id", advanceId);
          await supabase.from("advance_refunds").delete().eq("id", refundId);
          throw glErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["advance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      toast.success("Refund processed successfully");
      setRefundDialogOpen(false);
      setSelectedAdvance(null);
      setRefundAmount("");
      setRefundMethod("cash");
      setRefundReason("");
    },
    onError: (err: Error) => toast.error(`Refund failed: ${err.message}`),
  });

   const openRefund = (advance: any) => {
     setSelectedAdvance(advance);
     setRefundDialogOpen(true);
   };

   const openEdit = (advance: any) => {
     setSelectedAdvance(advance);
     setEditAmount(String(advance.amount || ""));
     setEditPaymentMethod(advance.payment_method || "cash");
     setEditDescription(advance.description || "");
     setEditChequeNumber(advance.cheque_number || "");
     setEditTransactionId(advance.transaction_id || "");
     setEditDialogOpen(true);
   };

   // Edit mutation
   const editMutation = useMutation({
     mutationFn: async ({ advanceId, amount, paymentMethod, description, chequeNumber, transactionId }: {
       advanceId: string; amount: number; paymentMethod: string; description: string; chequeNumber: string; transactionId: string;
     }) => {
       const updateData: any = {
         amount,
         payment_method: paymentMethod,
         description: description || null,
         cheque_number: paymentMethod === "cheque" ? (chequeNumber || null) : null,
         transaction_id: (paymentMethod === "upi" || paymentMethod === "bank_transfer") ? (transactionId || null) : null,
       };
       const { error } = await supabase
         .from("customer_advances")
         .update(updateData)
         .eq("id", advanceId);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
       queryClient.invalidateQueries({ queryKey: ["advance-summary"] });
       queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
       queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
       toast.success("Advance updated successfully");
       setEditDialogOpen(false);
       setSelectedAdvance(null);
     },
     onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
   });

   const handleEditSubmit = () => {
     if (!selectedAdvance || !editAmount || parseFloat(editAmount) <= 0) {
       toast.error("Enter a valid amount");
       return;
     }
     const newAmount = parseFloat(editAmount);
     if (newAmount < (selectedAdvance.used_amount || 0)) {
       toast.error("Amount cannot be less than already used amount (₹" + fmt(selectedAdvance.used_amount || 0) + ")");
       return;
     }
     editMutation.mutate({
       advanceId: selectedAdvance.id,
       amount: newAmount,
       paymentMethod: editPaymentMethod,
       description: editDescription,
       chequeNumber: editChequeNumber,
       transactionId: editTransactionId,
     });
   };

   const handleRefundSubmit = () => {
     if (!selectedAdvance || !refundAmount || parseFloat(refundAmount) <= 0) {
       toast.error("Enter a valid refund amount");
       return;
     }
     refundMutation.mutate({
       advanceId: selectedAdvance.id,
       amount: parseFloat(refundAmount),
       method: refundMethod,
       reason: refundReason,
     });
   };

  const availableForRefund = selectedAdvance ? (selectedAdvance.amount - selectedAdvance.used_amount) : 0;

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === advances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(advances.map((a: any) => a.id)));
    }
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Safety check: don't allow deleting advances that have been adjusted against invoices
      const { data: rows, error: fetchErr } = await supabase
        .from("customer_advances")
        .select("id, advance_number, used_amount")
        .in("id", ids);
      if (fetchErr) throw fetchErr;
      const used = (rows || []).filter((r: any) => Number(r.used_amount) > 0);
      if (used.length > 0) {
        const nums = used.map((r: any) => r.advance_number).join(", ");
        throw new Error(
          `Cannot delete used advance(s): ${nums}. Already adjusted against invoices — reverse the adjustment first.`
        );
      }

      const { data: acctDel } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", orgId!)
        .maybeSingle();
      if (
        isAccountingEngineEnabled(acctDel as { accounting_engine_enabled?: boolean } | null)
      ) {
        for (const id of ids) {
          await deleteJournalEntryByReference(orgId!, "CustomerAdvanceReceipt", id, supabase);
        }
      }

      const { data: deleted, error } = await supabase
        .from("customer_advances")
        .delete()
        .in("id", ids)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("No records were deleted. You may not have permission.");
      }
      if (deleted.length !== ids.length) {
        throw new Error(`Only ${deleted.length} of ${ids.length} advances were deleted.`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["advance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      toast.success(`${selectedIds.size} advance(s) deleted`);
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active": return <Badge className="bg-green-600 text-white">Active</Badge>;
      case "partially_used": return <Badge className="bg-yellow-600 text-white">Partial</Badge>;
      case "fully_used": return <Badge className="bg-muted text-muted-foreground">Used</Badge>;
      case "refunded": return <Badge className="bg-red-600 text-white">Refunded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-purple-500 rounded-full" />
          <div className="flex items-center gap-2">
            <Coins className="h-6 w-6 text-purple-500" />
            <h1 className="text-2xl font-bold tracking-tight">Advance Booking</h1>
            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs font-semibold">
              {totalCount} records
            </Badge>
          </div>
        </div>
         <Button
          onClick={() => setAddDialogOpen(true)}
          className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold gap-1.5"
        >
          <Plus className="h-4 w-4" /> New Advance
        </Button>
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm border-l-4 border-l-blue-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Advances</p>
          <p className="text-2xl font-extrabold text-blue-600 mt-1">{summary?.total || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm border-l-4 border-l-green-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Amount</p>
          <p className="text-2xl font-extrabold text-green-600 mt-1 flex items-center gap-0.5">
            <IndianRupee className="h-5 w-5" />{fmt(summary?.totalAmount || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm border-l-4 border-l-orange-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Used Amount</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1 flex items-center gap-0.5">
            <TrendingUp className="h-5 w-5" />{fmt(summary?.usedAmount || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm border-l-4 border-l-purple-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Available Balance</p>
          <p className="text-2xl font-extrabold text-purple-600 mt-1 flex items-center gap-0.5">
            <Wallet className="h-5 w-5" />{fmt(summary?.available || 0)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-muted/30 px-3 py-2 rounded-xl border border-border">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search advance no, customer, phone..."
            className="pl-8"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v as DateFilter); setCurrentPage(1); }}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setCurrentPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="partially_used">Partially Used</SelectItem>
            <SelectItem value="fully_used">Fully Used</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => {
          queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["advance-summary"] });
        }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
           <TableHeader>
            <TableRow>
              <TableHead className="w-10 bg-muted/40">
                <Checkbox
                  checked={advances.length > 0 && selectedIds.size === advances.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Advance No</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Customer</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Phone</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Date</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 text-right">Amount</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 text-right">Used</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 text-right">Available</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Payment</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Status</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : advances.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No advance bookings found</TableCell></TableRow>
            ) : (
              advances.map((adv: any) => {
                const available = (adv.amount || 0) - (adv.used_amount || 0);
                const canRefund = adv.status === "active" || adv.status === "partially_used";
                return (
                  <TableRow key={adv.id} className={selectedIds.has(adv.id) ? "bg-muted/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(adv.id)}
                        onCheckedChange={() => toggleSelect(adv.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{adv.advance_number}</TableCell>
                    <TableCell className="text-sm">
                      <button
                        className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomerForHistory({ id: adv.customer_id, name: adv.customers?.customer_name || "-" });
                          setShowCustomerHistory(true);
                        }}
                      >
                        {adv.customers?.customer_name || "-"}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{adv.customers?.phone || "-"}</TableCell>
                    <TableCell className="text-sm">{adv.advance_date ? format(new Date(adv.advance_date), "dd/MM/yy") : "-"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">₹{fmt(adv.amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">₹{fmt(adv.used_amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-green-600">₹{fmt(available)}</TableCell>
                    <TableCell className="text-sm capitalize">{adv.payment_method?.replace("_", " ") || "-"}</TableCell>
                    <TableCell>{getStatusBadge(adv.status)}</TableCell>
                     <TableCell>
                       <div className="flex items-center gap-1.5">
                         <Button
                           variant="ghost"
                           size="icon"
                           onClick={() => openPrintDialog(adv)}
                           title="Print Receipt"
                           className="h-7 w-7 text-muted-foreground hover:text-foreground"
                         >
                           <Printer className="h-3.5 w-3.5" />
                         </Button>
                         {canRefund && (
                           <>
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => openEdit(adv)}
                               className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                             >
                               <Pencil className="h-3 w-3 mr-1" /> Edit
                             </Button>
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => openRefund(adv)}
                               className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                             >
                               <Undo2 className="h-3 w-3 mr-1" /> Refund ₹{((adv.amount || 0) - (adv.used_amount || 0)).toLocaleString('en-IN')}
                             </Button>
                           </>
                         )}
                       </div>
                     </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} ({totalCount} total)
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="xs" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-3 w-3" /> Prev
            </Button>
            <Button variant="outline" size="xs" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              Next <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Advance Dialog */}
      {orgId && (
        <AddAdvanceBookingDialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (!open) {
              queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["advance-summary"] });
            }
          }}
          organizationId={orgId}
        />
      )}

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-red-500" />
              Refund Advance
            </DialogTitle>
            <DialogDescription>Process a refund for this advance booking.</DialogDescription>
          </DialogHeader>

          {selectedAdvance && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Advance No:</span> <span className="font-medium">{selectedAdvance.advance_number}</span></div>
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{selectedAdvance.customers?.customer_name}</span></div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-medium">₹{fmt(selectedAdvance.amount)}</span></div>
                <div><span className="text-muted-foreground">Used:</span> <span className="font-medium">₹{fmt(selectedAdvance.used_amount)}</span></div>
              </div>

              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground">Refundable Balance</p>
                <p className="text-2xl font-bold text-green-600">₹{fmt(availableForRefund)}</p>
              </div>

              <div className="space-y-2">
                <Label>Refund Amount *</Label>
                <Input
                  type="number"
                  placeholder={`Max ₹${fmt(availableForRefund)}`}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  max={availableForRefund}
                />
              </div>

              <div className="space-y-2">
                <Label>Refund Method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Textarea
                  placeholder="Reason for refund..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefundSubmit} disabled={refundMutation.isPending}>
              {refundMutation.isPending ? "Processing..." : "Process Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
       </Dialog>

       {/* Edit Dialog */}
       <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
         <DialogContent className="sm:max-w-[450px]">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Pencil className="h-5 w-5 text-blue-500" />
               Edit Advance
             </DialogTitle>
             <DialogDescription>Update advance booking details.</DialogDescription>
           </DialogHeader>

           {selectedAdvance && (
             <div className="space-y-4 py-2">
               <div className="grid grid-cols-2 gap-3 text-sm">
                 <div><span className="text-muted-foreground">Advance No:</span> <span className="font-medium">{selectedAdvance.advance_number}</span></div>
                 <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{selectedAdvance.customers?.customer_name}</span></div>
                 {(selectedAdvance.used_amount || 0) > 0 && (
                   <div className="col-span-2"><span className="text-muted-foreground">Used Amount:</span> <span className="font-medium text-orange-600">₹{fmt(selectedAdvance.used_amount || 0)}</span></div>
                 )}
               </div>

               <div className="space-y-2">
                 <Label>Amount *</Label>
                 <Input
                   type="number"
                   placeholder="Enter amount"
                   value={editAmount}
                   onChange={(e) => setEditAmount(e.target.value)}
                   min={selectedAdvance.used_amount || 0}
                 />
                 {(selectedAdvance.used_amount || 0) > 0 && (
                   <p className="text-xs text-muted-foreground">Minimum: ₹{fmt(selectedAdvance.used_amount || 0)} (already used)</p>
                 )}
               </div>

               <div className="space-y-2">
                 <Label>Payment Method</Label>
                 <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="cash">Cash</SelectItem>
                     <SelectItem value="card">Card</SelectItem>
                     <SelectItem value="upi">UPI</SelectItem>
                     <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                     <SelectItem value="cheque">Cheque</SelectItem>
                   </SelectContent>
                 </Select>
               </div>

               {editPaymentMethod === "cheque" && (
                 <div className="space-y-2">
                   <Label>Cheque Number</Label>
                   <Input
                     placeholder="Enter cheque number"
                     value={editChequeNumber}
                     onChange={(e) => setEditChequeNumber(e.target.value)}
                   />
                 </div>
               )}

               {(editPaymentMethod === "upi" || editPaymentMethod === "bank_transfer") && (
                 <div className="space-y-2">
                   <Label>Transaction ID</Label>
                   <Input
                     placeholder="Enter transaction ID"
                     value={editTransactionId}
                     onChange={(e) => setEditTransactionId(e.target.value)}
                   />
                 </div>
               )}

               <div className="space-y-2">
                 <Label>Description (Optional)</Label>
                 <Textarea
                   placeholder="Description..."
                   value={editDescription}
                   onChange={(e) => setEditDescription(e.target.value)}
                   rows={2}
                 />
               </div>
             </div>
           )}

           <DialogFooter>
             <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
             <Button onClick={handleEditSubmit} disabled={editMutation.isPending}>
               {editMutation.isPending ? "Saving..." : "Save Changes"}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       <CustomerHistoryDialog
         open={showCustomerHistory}
         onOpenChange={setShowCustomerHistory}
         customerId={selectedCustomerForHistory?.id || null}
         customerName={selectedCustomerForHistory?.name || ''}
         organizationId={currentOrganization?.id || ''}
        />

       {/* Print Dialog */}
       <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
         <DialogContent className="sm:max-w-[400px]">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Printer className="h-5 w-5 text-primary" />
               Print Advance Receipt
             </DialogTitle>
             <DialogDescription>
               Print receipt for advance <strong>{printAdvance?.advance_number}</strong>
             </DialogDescription>
           </DialogHeader>
           {printAdvance && (
             <div className="space-y-4 py-2">
               <div className="grid grid-cols-2 gap-2 text-sm">
                 <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{printAdvance.customers?.customer_name}</span></div>
                 <div><span className="text-muted-foreground">Amount:</span> <span className="font-medium">₹{fmt(printAdvance.amount)}</span></div>
               </div>
               <div className="space-y-2">
                 <Label>Paper Size</Label>
                 <Select value={printPaperSize} onValueChange={(v) => setPrintPaperSize(v as "A4" | "A5")}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="A5">A5 (Half Page)</SelectItem>
                     <SelectItem value="A4">A4 (Full Page)</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
             </div>
           )}
           <DialogFooter>
             <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>Cancel</Button>
             <Button onClick={() => handleDashPrint()}>
               <Printer className="h-4 w-4 mr-1" /> Print
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* Hidden print receipt */}
       {printAdvance && (
         <AdvanceBookingReceipt
           ref={dashPrintRef}
           data={{
             advanceNumber: printAdvance.advance_number,
             advanceDate: printAdvance.advance_date,
             customerName: printAdvance.customers?.customer_name || "",
             customerPhone: printAdvance.customers?.phone || undefined,
             amount: printAdvance.amount || 0,
             paymentMethod: printAdvance.payment_method || "cash",
             chequeNumber: printAdvance.cheque_number || undefined,
             transactionId: printAdvance.transaction_id || undefined,
             description: printAdvance.description || undefined,
           }}
           company={dashCompanyDetails}
           paperSize={printPaperSize}
         />
       )}

       {/* Delete Confirmation Dialog */}
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete {selectedIds.size} Advance Booking(s)?</AlertDialogTitle>
             <AlertDialogDescription>
               This action cannot be undone. The selected advance records will be permanently deleted.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
               onClick={() => deleteMutation.mutate(Array.from(selectedIds))}
               disabled={deleteMutation.isPending}
             >
               {deleteMutation.isPending ? "Deleting..." : "Delete"}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
      </div>
   );
}
