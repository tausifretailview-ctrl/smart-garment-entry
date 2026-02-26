import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronsUpDown, Check, IndianRupee, AlertCircle, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { fetchAllCustomers } from "@/utils/fetchAllRows";

interface CustomerBalanceAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

const INVALIDATION_KEYS = [
  ["customer-adjustment-balance"],
  ["all-customers-adjustment-balances"],
  ["balance-adjustments"],
  ["customer-ledger"],
  ["customers-with-balance"],
  ["customer-balance"],
  ["customer-advances"],
  ["customer-advance-balance"],
  ["advance-dashboard"],
];

export function CustomerBalanceAdjustmentDialog({
  open,
  onOpenChange,
  organizationId,
}: CustomerBalanceAdjustmentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newOutstanding, setNewOutstanding] = useState("");
  const [newAdvance, setNewAdvance] = useState("");
  const [reason, setReason] = useState("");

  // Action confirmation state
  const [actionAdj, setActionAdj] = useState<any | null>(null);
  const [actionType, setActionType] = useState<"delete" | "reverse" | null>(null);

  const invalidateAll = () => {
    INVALIDATION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  // Fetch customers with outstanding and advance balances
  const { data: customers } = useQuery({
    queryKey: ["all-customers-adjustment-balances", organizationId],
    queryFn: async () => {
      const allCustomers = await fetchAllCustomers(organizationId);

      const { data: allSales } = await supabase
        .from("sales")
        .select("id, customer_id, net_amount, paid_amount")
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      const { data: allVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      const { data: allAdvances } = await supabase
        .from("customer_advances")
        .select("customer_id, amount, used_amount")
        .eq("organization_id", organizationId)
        .eq("status", "active");

      const saleIdSet = new Set((allSales || []).map((s: any) => s.id));
      const invoiceVoucherPayments = new Map<string, number>();
      const openingBalancePayments = new Map<string, number>();

      (allVouchers || []).forEach((v: any) => {
        if (!v.reference_id) return;
        if (saleIdSet.has(v.reference_id)) {
          invoiceVoucherPayments.set(v.reference_id, (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        } else if (v.reference_type === "customer") {
          openingBalancePayments.set(v.reference_id, (openingBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        }
      });

      const customerOutstanding = new Map<string, number>();
      (allSales || []).forEach((sale: any) => {
        if (!sale.customer_id) return;
        const salePaid = sale.paid_amount || 0;
        const voucherPaid = invoiceVoucherPayments.get(sale.id) || 0;
        const effectivePaid = Math.max(salePaid, voucherPaid);
        const outstanding = Math.max(0, (sale.net_amount || 0) - effectivePaid);
        customerOutstanding.set(sale.customer_id, (customerOutstanding.get(sale.customer_id) || 0) + outstanding);
      });

      const customerAdvance = new Map<string, number>();
      (allAdvances || []).forEach((a: any) => {
        if (!a.customer_id) return;
        const available = (a.amount || 0) - (a.used_amount || 0);
        if (available > 0) {
          customerAdvance.set(a.customer_id, (customerAdvance.get(a.customer_id) || 0) + available);
        }
      });

      return allCustomers.map((c: any) => ({
        ...c,
        outstandingBalance: Math.round((c.opening_balance || 0) + (customerOutstanding.get(c.id) || 0) - (openingBalancePayments.get(c.id) || 0)),
        advanceBalance: Math.round(customerAdvance.get(c.id) || 0),
      }));
    },
    enabled: !!organizationId && open,
  });

  // Fetch current outstanding for selected customer
  const { data: currentBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ["customer-adjustment-balance", selectedCustomerId, organizationId],
    queryFn: async () => {
      const { data: customer } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", selectedCustomerId)
        .single();

      const openingBalance = customer?.opening_balance || 0;

      const { data: sales } = await supabase
        .from("sales")
        .select("id, net_amount, paid_amount")
        .eq("customer_id", selectedCustomerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      const saleIds = sales?.map((s) => s.id) || [];

      const { data: vouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      const invoiceVoucherPayments = new Map<string, number>();
      let openingBalancePayments = 0;
      const saleIdSet = new Set(saleIds);

      vouchers?.forEach((v) => {
        if (!v.reference_id) return;
        if (saleIdSet.has(v.reference_id)) {
          invoiceVoucherPayments.set(
            v.reference_id,
            (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        } else if (v.reference_type === "customer" && v.reference_id === selectedCustomerId) {
          openingBalancePayments += Number(v.total_amount) || 0;
        }
      });

      let totalSales = 0;
      let totalPaid = 0;
      sales?.forEach((sale) => {
        totalSales += sale.net_amount || 0;
        const salePaid = sale.paid_amount || 0;
        const voucherPaid = invoiceVoucherPayments.get(sale.id) || 0;
        totalPaid += Math.max(salePaid, voucherPaid);
      });
      totalPaid += openingBalancePayments;

      const outstanding = Math.round(openingBalance + totalSales - totalPaid);

      const { data: advances } = await supabase
        .from("customer_advances")
        .select("amount, used_amount")
        .eq("customer_id", selectedCustomerId)
        .eq("organization_id", organizationId)
        .in("status", ["active", "partially_used"]);

      const totalAdvance = advances?.reduce(
        (sum, a) => sum + ((a.amount || 0) - (a.used_amount || 0)),
        0
      ) || 0;

      return { outstanding, advance: Math.round(totalAdvance) };
    },
    enabled: !!selectedCustomerId && !!organizationId,
  });

  // Fetch adjustment history
  const { data: adjustmentHistory } = useQuery({
    queryKey: ["balance-adjustments", selectedCustomerId, organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedCustomerId && !!organizationId,
  });

  const selectedCustomer = customers?.find((c: any) => c.id === selectedCustomerId);

  const outstandingDiff = newOutstanding !== "" && currentBalance
    ? parseFloat(newOutstanding) - currentBalance.outstanding
    : 0;
  const advanceDiff = newAdvance !== "" && currentBalance
    ? parseFloat(newAdvance) - currentBalance.advance
    : 0;

  // Helper: apply outstanding + advance changes (used by save, reverse, delete)
  const applyAdjustmentEffects = async (customerId: string, outDiff: number, advDiff: number, reasonText: string) => {
    // Outstanding: adjust opening_balance
    if (outDiff !== 0) {
      const { data: cust } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", customerId)
        .single();
      const currentOpening = cust?.opening_balance || 0;
      await supabase
        .from("customers")
        .update({ opening_balance: currentOpening + outDiff })
        .eq("id", customerId);
    }

    // Advance
    if (advDiff > 0) {
      const { data: advNum } = await supabase.rpc("generate_advance_number", {
        p_organization_id: organizationId,
      });
      await supabase.from("customer_advances").insert({
        organization_id: organizationId,
        customer_id: customerId,
        amount: advDiff,
        used_amount: 0,
        advance_number: advNum || `ADJ-${Date.now()}`,
        description: `Balance Adjustment: ${reasonText}`,
        payment_method: "other",
        status: "active",
        created_by: user?.id,
      });
    } else if (advDiff < 0) {
      const { data: activeAdvances } = await supabase
        .from("customer_advances")
        .select("id, amount, used_amount")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .in("status", ["active", "partially_used"])
        .order("advance_date", { ascending: true });

      let remaining = Math.abs(advDiff);
      for (const adv of activeAdvances || []) {
        if (remaining <= 0) break;
        const available = (adv.amount || 0) - (adv.used_amount || 0);
        const deduct = Math.min(available, remaining);
        if (deduct > 0) {
          const newUsed = (adv.used_amount || 0) + deduct;
          await supabase
            .from("customer_advances")
            .update({
              used_amount: newUsed,
              status: newUsed >= (adv.amount || 0) ? "fully_used" : "partially_used",
            })
            .eq("id", adv.id);
          remaining -= deduct;
        }
      }
    }
  };

  const saveAdjustment = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId || !reason.trim()) throw new Error("Customer and reason are required");
      if (newOutstanding === "" && newAdvance === "") throw new Error("Enter at least one adjustment value");

      const { error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .insert({
          organization_id: organizationId,
          customer_id: selectedCustomerId,
          previous_outstanding: currentBalance?.outstanding || 0,
          new_outstanding: newOutstanding !== "" ? parseFloat(newOutstanding) : currentBalance?.outstanding || 0,
          outstanding_difference: newOutstanding !== "" ? outstandingDiff : 0,
          previous_advance: currentBalance?.advance || 0,
          new_advance: newAdvance !== "" ? parseFloat(newAdvance) : currentBalance?.advance || 0,
          advance_difference: newAdvance !== "" ? advanceDiff : 0,
          reason: reason.trim(),
          created_by: user?.id,
        });
      if (error) throw error;

      const effectiveOutDiff = newOutstanding !== "" ? outstandingDiff : 0;
      const effectiveAdvDiff = newAdvance !== "" ? advanceDiff : 0;
      await applyAdjustmentEffects(selectedCustomerId, effectiveOutDiff, effectiveAdvDiff, reason.trim());
    },
    onSuccess: () => {
      toast.success("Balance adjustment saved successfully");
      invalidateAll();
      setNewOutstanding("");
      setNewAdvance("");
      setReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save adjustment");
    },
  });

  // Delete adjustment mutation
  const deleteAdjustment = useMutation({
    mutationFn: async (adj: any) => {
      // Reverse the financial effects (negate the original differences)
      await applyAdjustmentEffects(
        adj.customer_id,
        -(adj.outstanding_difference || 0),
        -(adj.advance_difference || 0),
        `Delete reversal: ${adj.reason}`
      );
      // Remove the record
      const { error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .delete()
        .eq("id", adj.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adjustment deleted and reversed successfully");
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete adjustment"),
  });

  // Reverse adjustment mutation
  const reverseAdjustment = useMutation({
    mutationFn: async (adj: any) => {
      const reversedOutDiff = -(adj.outstanding_difference || 0);
      const reversedAdvDiff = -(adj.advance_difference || 0);

      // Insert counter-adjustment record
      const { error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .insert({
          organization_id: organizationId,
          customer_id: adj.customer_id,
          previous_outstanding: adj.new_outstanding,
          new_outstanding: adj.previous_outstanding,
          outstanding_difference: reversedOutDiff,
          previous_advance: adj.new_advance,
          new_advance: adj.previous_advance,
          advance_difference: reversedAdvDiff,
          reason: `Reversal of: ${adj.reason}`,
          created_by: user?.id,
        });
      if (error) throw error;

      // Apply the reverse financial effects
      await applyAdjustmentEffects(adj.customer_id, reversedOutDiff, reversedAdvDiff, `Reversal of: ${adj.reason}`);
    },
    onSuccess: () => {
      toast.success("Adjustment reversed successfully");
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || "Failed to reverse adjustment"),
  });

  const handleConfirmAction = () => {
    if (!actionAdj || !actionType) return;
    if (actionType === "delete") {
      deleteAdjustment.mutate(actionAdj);
    } else {
      reverseAdjustment.mutate(actionAdj);
    }
    setActionAdj(null);
    setActionType(null);
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setNewOutstanding("");
    setNewAdvance("");
    setReason("");
  };

  const isActioning = deleteAdjustment.isPending || reverseAdjustment.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Customer Balance Adjustment
            </DialogTitle>
            <DialogDescription>
              Adjust customer outstanding or advance balance with audit trail
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label>Select Customer *</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {selectedCustomer ? selectedCustomer.customer_name : "Search customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customer..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup className="max-h-60 overflow-y-auto">
                        {customers?.map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.customer_name} ${c.phone || ''}`}
                            onSelect={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerSearchOpen(false);
                              setNewOutstanding("");
                              setNewAdvance("");
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedCustomerId === c.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate">{c.customer_name}</span>
                                {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                              </div>
                              <div className="flex items-center gap-3 text-xs mt-0.5">
                                {c.outstandingBalance > 0 && (
                                  <span className="text-destructive font-medium">OS: ₹{c.outstandingBalance.toLocaleString("en-IN")}</span>
                                )}
                                {c.advanceBalance > 0 && (
                                  <span className="text-green-600 dark:text-green-400 font-medium">Adv: ₹{c.advanceBalance.toLocaleString("en-IN")}</span>
                                )}
                                {c.outstandingBalance <= 0 && c.advanceBalance <= 0 && (
                                  <span className="text-muted-foreground">No balance</span>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Current Balances */}
            {selectedCustomerId && (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Current Outstanding</Label>
                  <p className="text-lg font-bold text-destructive">
                    {balanceLoading ? "..." : `₹${(currentBalance?.outstanding || 0).toLocaleString("en-IN")}`}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Current Advance</Label>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {balanceLoading ? "..." : `₹${(currentBalance?.advance || 0).toLocaleString("en-IN")}`}
                  </p>
                </div>
              </div>
            )}

            {/* New Values */}
            {selectedCustomerId && !balanceLoading && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>New Outstanding</Label>
                    <Input
                      type="number"
                      placeholder={String(currentBalance?.outstanding || 0)}
                      value={newOutstanding}
                      onChange={(e) => setNewOutstanding(e.target.value)}
                    />
                    {newOutstanding !== "" && (
                      <Badge variant={outstandingDiff > 0 ? "destructive" : outstandingDiff < 0 ? "default" : "secondary"} className="text-xs">
                        {outstandingDiff > 0 ? "+" : ""}{outstandingDiff.toLocaleString("en-IN")}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>New Advance</Label>
                    <Input
                      type="number"
                      placeholder={String(currentBalance?.advance || 0)}
                      value={newAdvance}
                      onChange={(e) => setNewAdvance(e.target.value)}
                    />
                    {newAdvance !== "" && (
                      <Badge variant={advanceDiff > 0 ? "default" : advanceDiff < 0 ? "destructive" : "secondary"} className="text-xs">
                        {advanceDiff > 0 ? "+" : ""}{advanceDiff.toLocaleString("en-IN")}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Reason *
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Textarea
                    placeholder="Enter reason for adjustment (mandatory)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* Adjustment History */}
            {adjustmentHistory && adjustmentHistory.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Recent Adjustments</Label>
                <div className="max-h-40 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Outstanding</TableHead>
                        <TableHead className="text-xs">Advance</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                        <TableHead className="text-xs w-[70px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustmentHistory.map((adj: any) => (
                        <TableRow key={adj.id}>
                          <TableCell className="text-xs">{format(new Date(adj.created_at), "dd/MM/yy")}</TableCell>
                          <TableCell className="text-xs">
                            {adj.outstanding_difference !== 0 && (
                              <span className={adj.outstanding_difference > 0 ? "text-destructive" : "text-green-600"}>
                                {adj.outstanding_difference > 0 ? "+" : ""}{adj.outstanding_difference}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {adj.advance_difference !== 0 && (
                              <span className={adj.advance_difference > 0 ? "text-green-600" : "text-destructive"}>
                                {adj.advance_difference > 0 ? "+" : ""}{adj.advance_difference}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{adj.reason}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={isActioning}
                                title="Reverse (creates counter-entry)"
                                onClick={() => { setActionAdj(adj); setActionType("reverse"); }}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                disabled={isActioning}
                                title="Delete (removes entry & reverses effect)"
                                onClick={() => { setActionAdj(adj); setActionType("delete"); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => saveAdjustment.mutate()}
              disabled={
                saveAdjustment.isPending ||
                !selectedCustomerId ||
                !reason.trim() ||
                (newOutstanding === "" && newAdvance === "")
              }
            >
              {saveAdjustment.isPending ? "Saving..." : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!actionAdj && !!actionType} onOpenChange={(v) => { if (!v) { setActionAdj(null); setActionType(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "delete" ? "Delete Adjustment?" : "Reverse Adjustment?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {actionType === "delete" ? (
                <span>This will permanently remove this adjustment and reverse its financial effects on the customer's balance.</span>
              ) : (
                <span>This will create a counter-entry that reverses the effect while keeping both entries visible for audit purposes.</span>
              )}
              {actionAdj && (
                <span className="block mt-2 text-xs text-muted-foreground">
                  Outstanding: {actionAdj.outstanding_difference > 0 ? "+" : ""}{actionAdj.outstanding_difference} · 
                  Advance: {actionAdj.advance_difference > 0 ? "+" : ""}{actionAdj.advance_difference} · 
                  Reason: {actionAdj.reason}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={actionType === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {actionType === "delete" ? "Delete & Reverse" : "Create Reversal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
