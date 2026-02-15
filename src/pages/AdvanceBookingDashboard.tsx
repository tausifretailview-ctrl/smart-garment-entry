import { useState, useMemo, useCallback } from "react";
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
import { Coins, Plus, Search, RefreshCw, Undo2, IndianRupee, TrendingUp, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import { useAuth } from "@/contexts/AuthContext";

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
  const [selectedAdvance, setSelectedAdvance] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundReason, setRefundReason] = useState("");

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
    const timeout = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timeout);
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
      let query = supabase
        .from("customer_advances")
        .select("*, customers(customer_name, phone)", { count: "exact" })
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });

      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        query = query.or(`advance_number.ilike.${term},customers.customer_name.ilike.${term},customers.phone.ilike.${term}`);
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
      // Get current advance
      const { data: adv, error: fetchErr } = await supabase
        .from("customer_advances")
        .select("amount, used_amount")
        .eq("id", advanceId)
        .single();
      if (fetchErr) throw fetchErr;

      const available = (adv.amount || 0) - (adv.used_amount || 0);
      if (amount > available) throw new Error("Refund amount exceeds available balance");

      const newUsed = (adv.used_amount || 0) + amount;
      const newStatus = amount >= available ? "refunded" : "partially_used";

      // Insert refund record
      const { error: refundErr } = await supabase.from("advance_refunds").insert({
        organization_id: orgId!,
        advance_id: advanceId,
        refund_amount: amount,
        payment_method: method,
        reason: reason || null,
        created_by: user?.id || null,
      });
      if (refundErr) throw refundErr;

      // Update advance
      const { error: updateErr } = await supabase
        .from("customer_advances")
        .update({ used_amount: newUsed, status: newStatus })
        .eq("id", advanceId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["advance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
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
        <div className="flex items-center gap-2">
          <Coins className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Advance Booking</h1>
          <Badge variant="secondary" className="text-sm">{totalCount} records</Badge>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Advance
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">Total Advances</p>
            <p className="text-2xl font-bold">{summary?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-2xl font-bold flex items-center gap-1"><IndianRupee className="h-5 w-5" />{fmt(summary?.totalAmount || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">Used Amount</p>
            <p className="text-2xl font-bold flex items-center gap-1"><TrendingUp className="h-5 w-5" />{fmt(summary?.usedAmount || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">Available Balance</p>
            <p className="text-2xl font-bold flex items-center gap-1"><Wallet className="h-5 w-5" />{fmt(summary?.available || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
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
              <TableHead>Advance No</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : advances.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No advance bookings found</TableCell></TableRow>
            ) : (
              advances.map((adv: any) => {
                const available = (adv.amount || 0) - (adv.used_amount || 0);
                const canRefund = adv.status === "active" || adv.status === "partially_used";
                return (
                  <TableRow key={adv.id}>
                    <TableCell className="font-medium text-sm">{adv.advance_number}</TableCell>
                    <TableCell className="text-sm">{adv.customers?.customer_name || "-"}</TableCell>
                    <TableCell className="text-sm">{adv.customers?.phone || "-"}</TableCell>
                    <TableCell className="text-sm">{adv.advance_date ? format(new Date(adv.advance_date), "dd/MM/yy") : "-"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">₹{fmt(adv.amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">₹{fmt(adv.used_amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-green-600">₹{fmt(available)}</TableCell>
                    <TableCell className="text-sm capitalize">{adv.payment_method?.replace("_", " ") || "-"}</TableCell>
                    <TableCell>{getStatusBadge(adv.status)}</TableCell>
                    <TableCell>
                      {canRefund && (
                        <Button variant="outline" size="xs" onClick={() => openRefund(adv)} className="text-red-600 hover:text-red-700">
                          <Undo2 className="h-3 w-3 mr-1" /> Refund
                        </Button>
                      )}
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
    </div>
  );
}
