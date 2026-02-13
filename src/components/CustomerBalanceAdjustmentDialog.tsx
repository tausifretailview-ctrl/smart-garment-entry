import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronsUpDown, Check, IndianRupee, AlertCircle } from "lucide-react";
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

  // Fetch customers
  const { data: customers } = useQuery({
    queryKey: ["all-customers-adjustment", organizationId],
    queryFn: () => fetchAllCustomers(organizationId),
    enabled: !!organizationId && open,
  });

  // Fetch current outstanding for selected customer
  const { data: currentBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ["customer-adjustment-balance", selectedCustomerId, organizationId],
    queryFn: async () => {
      // Outstanding = opening_balance + sum(net_amount) - sum(max(paid_amount, voucher_payments))
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

      // Fetch current advance balance
      const { data: advances } = await supabase
        .from("customer_advances")
        .select("amount, used_amount")
        .eq("customer_id", selectedCustomerId)
        .eq("organization_id", organizationId)
        .eq("status", "active");

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

  const saveAdjustment = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId || !reason.trim()) {
        throw new Error("Customer and reason are required");
      }
      if (newOutstanding === "" && newAdvance === "") {
        throw new Error("Enter at least one adjustment value");
      }

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

      // Apply outstanding adjustment by updating customer opening_balance
      if (newOutstanding !== "" && outstandingDiff !== 0) {
        const { data: cust } = await supabase
          .from("customers")
          .select("opening_balance")
          .eq("id", selectedCustomerId)
          .single();

        const currentOpening = cust?.opening_balance || 0;
        await supabase
          .from("customers")
          .update({ opening_balance: currentOpening + outstandingDiff })
          .eq("id", selectedCustomerId);
      }

      // Apply advance adjustment by creating a new advance entry
      if (newAdvance !== "" && advanceDiff !== 0) {
        if (advanceDiff > 0) {
          // Create new advance entry
          const { data: advNum } = await supabase.rpc("generate_advance_number", {
            p_organization_id: organizationId,
          });
          await supabase.from("customer_advances").insert({
            organization_id: organizationId,
            customer_id: selectedCustomerId,
            amount: advanceDiff,
            advance_number: advNum || `ADJ-${Date.now()}`,
            description: `Balance Adjustment: ${reason.trim()}`,
            payment_method: "other",
            created_by: user?.id,
          });
        } else {
          // Reduce advance: mark existing advances as used (FIFO)
          const { data: activeAdvances } = await supabase
            .from("customer_advances")
            .select("id, amount, used_amount")
            .eq("customer_id", selectedCustomerId)
            .eq("organization_id", organizationId)
            .eq("status", "active")
            .order("advance_date", { ascending: true });

          let remaining = Math.abs(advanceDiff);
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
                  status: newUsed >= (adv.amount || 0) ? "used" : "active",
                })
                .eq("id", adv.id);
              remaining -= deduct;
            }
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Balance adjustment saved successfully");
      queryClient.invalidateQueries({ queryKey: ["customer-adjustment-balance"] });
      queryClient.invalidateQueries({ queryKey: ["balance-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      setNewOutstanding("");
      setNewAdvance("");
      setReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save adjustment");
    },
  });

  const resetForm = () => {
    setSelectedCustomerId("");
    setNewOutstanding("");
    setNewAdvance("");
    setReason("");
  };

  return (
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
                          value={c.customer_name}
                          onSelect={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearchOpen(false);
                            setNewOutstanding("");
                            setNewAdvance("");
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedCustomerId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.customer_name}
                          {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Current Balances (Read-only) */}
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

              {/* Reason */}
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
  );
}
