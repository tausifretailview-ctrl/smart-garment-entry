import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { History, Loader2, Pencil, Printer, ChevronLeft, ChevronRight, Search, Trash2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";

const PAGE_SIZE = 10;

interface Props {
  organizationId: string;
}

// Shared helper to apply advance effects
async function applyAdvanceEffects(
  supabaseClient: typeof supabase,
  organizationId: string,
  customerId: string,
  advDiff: number,
  reasonText: string,
  userId?: string
) {
  if (advDiff > 0) {
    const { data: advNum } = await supabaseClient.rpc("generate_advance_number" as any, {
      p_organization_id: organizationId,
    });
    await (supabaseClient as any).from("customer_advances").insert({
      organization_id: organizationId,
      customer_id: customerId,
      amount: advDiff,
      used_amount: 0,
      advance_number: advNum || `ADJ-${Date.now()}`,
      description: `Balance Adjustment: ${reasonText}`,
      payment_method: "other",
      status: "active",
      created_by: userId,
    });
  } else if (advDiff < 0) {
    const { data: activeAdvances } = await supabaseClient
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
        await supabaseClient
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
}

export function RecentBalanceAdjustments({ organizationId }: Props) {
  const { user } = useAuth();
  const { hasSpecialPermission } = useUserPermissions();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [editAdj, setEditAdj] = useState<any>(null);
  const [editReason, setEditReason] = useState("");
  const [editNewOutstanding, setEditNewOutstanding] = useState("");
  const [editNewAdvance, setEditNewAdvance] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [customerForHistory, setCustomerForHistory] = useState<{ id: string; name: string } | null>(null);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [deleteAdj, setDeleteAdj] = useState<any>(null);
  const [reverseAdj, setReverseAdj] = useState<any>(null);

  const canModify = hasSpecialPermission('modify_records');
  const canDelete = hasSpecialPermission('delete_records');

  const { data, isLoading } = useQuery({
    queryKey: ["all-balance-adjustments", organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .select("*, customers:customer_id (customer_name, phone)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!organizationId,
  });

  const allAdjustments = data || [];

  const filteredAdjustments = useMemo(() => {
    if (!searchQuery.trim()) return allAdjustments;
    const q = searchQuery.toLowerCase();
    return allAdjustments.filter((adj: any) => {
      const name = adj.customers?.customer_name?.toLowerCase() || "";
      const phone = adj.customers?.phone || "";
      const reason = adj.reason?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q) || reason.includes(q);
    });
  }, [allAdjustments, searchQuery]);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(filteredAdjustments.length / PAGE_SIZE));
  const paged = filteredAdjustments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["all-balance-adjustments"] });
    queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
    queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
  };

  // UPDATE (modify) mutation - now supports outstanding/advance changes
  const updateMutation = useMutation({
    mutationFn: async ({ adj, reason, newOutstanding, newAdvance }: { adj: any; reason: string; newOutstanding: string; newAdvance: string }) => {
      const updatePayload: any = { reason };

      const outChanged = newOutstanding !== "" && Number(newOutstanding) !== adj.new_outstanding;
      const advChanged = newAdvance !== "" && Number(newAdvance) !== adj.new_advance;

      if (outChanged || advChanged) {
        const finalOut = newOutstanding !== "" ? Number(newOutstanding) : adj.new_outstanding;
        const finalAdv = newAdvance !== "" ? Number(newAdvance) : adj.new_advance;
        const newOutDiff = finalOut - adj.previous_outstanding;
        const newAdvDiff = finalAdv - adj.previous_advance;

        // Apply delta advance effects (difference between new and old advance_difference)
        const advDelta = newAdvDiff - (adj.advance_difference || 0);
        if (advDelta !== 0) {
          await applyAdvanceEffects(supabase, organizationId, adj.customer_id, advDelta, reason, user?.id);
        }

        updatePayload.new_outstanding = finalOut;
        updatePayload.outstanding_difference = newOutDiff;
        updatePayload.new_advance = finalAdv;
        updatePayload.advance_difference = newAdvDiff;
      }

      const { error, data: updatedRows } = await (supabase as any)
        .from("customer_balance_adjustments")
        .update(updatePayload)
        .eq("id", adj.id)
        .select();
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) throw new Error("Update failed — no rows affected. Please check your permissions.");
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Adjustment updated");
      setEditAdj(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update"),
  });

  // DELETE mutation
  const deleteMutation = useMutation({
    mutationFn: async (adj: any) => {
      // Reverse advance effects
      const advDiff = -(adj.advance_difference || 0);
      if (advDiff !== 0) {
        await applyAdvanceEffects(supabase, organizationId, adj.customer_id, advDiff, `Delete reversal: ${adj.reason}`, user?.id);
      }
      // Delete the record
      const { error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .delete()
        .eq("id", adj.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Adjustment deleted & effects reversed");
      setDeleteAdj(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  // REVERSE mutation
  const reverseMutation = useMutation({
    mutationFn: async (adj: any) => {
      const reversedOutDiff = -(adj.outstanding_difference || 0);
      const reversedAdvDiff = -(adj.advance_difference || 0);

      // Apply reverse advance effects
      if (reversedAdvDiff !== 0) {
        await applyAdvanceEffects(supabase, organizationId, adj.customer_id, reversedAdvDiff, `Reversal of: ${adj.reason}`, user?.id);
      }

      // Insert counter-record
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
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Adjustment reversed with counter-entry");
      setReverseAdj(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to reverse"),
  });

  const handlePrint = (adj: any) => {
    const w = window.open("", "_blank", "width=600,height=500");
    if (!w) return;
    w.document.write(`
      <html><head><title>Adjustment Receipt</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 14px; }
        h2 { margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
        th { background: #f5f5f5; }
        .header { margin-bottom: 12px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="header">
        <h2>Balance Adjustment Receipt</h2>
        <p>Date: ${format(new Date(adj.created_at), "dd/MM/yyyy HH:mm")}</p>
      </div>
      <table>
        <tr><th>Customer</th><td>${adj.customers?.customer_name || "—"}</td></tr>
        <tr><th>Phone</th><td>${adj.customers?.phone || "—"}</td></tr>
        <tr><th>Prev Outstanding</th><td>₹${(adj.previous_outstanding || 0).toLocaleString("en-IN")}</td></tr>
        <tr><th>New Outstanding</th><td>₹${(adj.new_outstanding || 0).toLocaleString("en-IN")}</td></tr>
        <tr><th>Outstanding Change</th><td>${adj.outstanding_difference > 0 ? "+" : ""}${(adj.outstanding_difference || 0).toLocaleString("en-IN")}</td></tr>
        <tr><th>Prev Advance</th><td>₹${(adj.previous_advance || 0).toLocaleString("en-IN")}</td></tr>
        <tr><th>New Advance</th><td>₹${(adj.new_advance || 0).toLocaleString("en-IN")}</td></tr>
        <tr><th>Advance Change</th><td>${adj.advance_difference > 0 ? "+" : ""}${(adj.advance_difference || 0).toLocaleString("en-IN")}</td></tr>
        <tr><th>Reason</th><td>${adj.reason || "—"}</td></tr>
      </table>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  const openEdit = (adj: any) => {
    setEditAdj(adj);
    setEditReason(adj.reason || "");
    setEditNewOutstanding(String(adj.new_outstanding || 0));
    setEditNewAdvance(String(adj.new_advance || 0));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Recent Adjustment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer name, phone or reason..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !filteredAdjustments.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">{searchQuery ? "No matching adjustments found." : "No adjustments made yet."}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-sidebar">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Prev Outstanding</TableHead>
                      <TableHead className="text-right">New Outstanding</TableHead>
                      <TableHead className="text-right">Prev Advance</TableHead>
                      <TableHead className="text-right">New Advance</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((adj: any) => (
                      <TableRow key={adj.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(adj.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div>
                            <button
                              className="font-medium text-sm text-primary hover:underline cursor-pointer text-left"
                              onClick={() => {
                                if (adj.customer_id) {
                                  setCustomerForHistory({ id: adj.customer_id, name: adj.customers?.customer_name || "Customer" });
                                  setShowCustomerHistory(true);
                                }
                              }}
                            >
                              {adj.customers?.customer_name || "—"}
                            </button>
                            {adj.customers?.phone && (
                              <p className="text-xs text-muted-foreground">{adj.customers.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          ₹{(adj.previous_outstanding || 0).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <span className="font-medium">₹{(adj.new_outstanding || 0).toLocaleString("en-IN")}</span>
                          {adj.outstanding_difference !== 0 && (
                            <Badge variant={adj.outstanding_difference > 0 ? "destructive" : "default"} className="ml-1 text-xs">
                              {adj.outstanding_difference > 0 ? "+" : ""}{adj.outstanding_difference.toLocaleString("en-IN")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          ₹{(adj.previous_advance || 0).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <span className="font-medium">₹{(adj.new_advance || 0).toLocaleString("en-IN")}</span>
                          {adj.advance_difference !== 0 && (
                            <Badge variant={adj.advance_difference > 0 ? "default" : "destructive"} className="ml-1 text-xs">
                              {adj.advance_difference > 0 ? "+" : ""}{adj.advance_difference.toLocaleString("en-IN")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{adj.reason}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canModify && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(adj)} title="Modify">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReverseAdj(adj)} title="Reverse">
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteAdj(adj)} title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrint(adj)} title="Print">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages} ({filteredAdjustments.length} records)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modify Dialog */}
      <Dialog open={!!editAdj} onOpenChange={(v) => !v && setEditAdj(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modify Adjustment</DialogTitle>
          </DialogHeader>
          {editAdj && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {editAdj.customers?.customer_name} — {format(new Date(editAdj.created_at), "dd/MM/yyyy HH:mm")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prev Outstanding</Label>
                  <Input value={`₹${(editAdj.previous_outstanding || 0).toLocaleString("en-IN")}`} disabled className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">New Outstanding</Label>
                  <Input
                    type="number"
                    value={editNewOutstanding}
                    onChange={(e) => setEditNewOutstanding(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prev Advance</Label>
                  <Input value={`₹${(editAdj.previous_advance || 0).toLocaleString("en-IN")}`} disabled className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">New Advance</Label>
                  <Input
                    type="number"
                    value={editNewAdvance}
                    onChange={(e) => setEditNewAdvance(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdj(null)}>Cancel</Button>
            <Button
              onClick={() => editAdj && updateMutation.mutate({ adj: editAdj, reason: editReason, newOutstanding: editNewOutstanding, newAdvance: editNewAdvance })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAdj} onOpenChange={(v) => !v && setDeleteAdj(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Adjustment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>reverse</strong> the financial effect and permanently delete this adjustment for{" "}
              <strong>{deleteAdj?.customers?.customer_name}</strong>.
              {deleteAdj && (
                <span className="block mt-2 text-sm">
                  Outstanding change: {deleteAdj.outstanding_difference > 0 ? "+" : ""}{deleteAdj.outstanding_difference?.toLocaleString("en-IN")} |
                  Advance change: {deleteAdj.advance_difference > 0 ? "+" : ""}{deleteAdj.advance_difference?.toLocaleString("en-IN")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAdj && deleteMutation.mutate(deleteAdj)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete & Reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Confirmation */}
      <AlertDialog open={!!reverseAdj} onOpenChange={(v) => !v && setReverseAdj(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Adjustment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a <strong>counter-entry</strong> to reverse the effect for{" "}
              <strong>{reverseAdj?.customers?.customer_name}</strong>. The original record will remain for audit trail.
              {reverseAdj && (
                <span className="block mt-2 text-sm">
                  Will reverse: Outstanding {reverseAdj.outstanding_difference > 0 ? "+" : ""}{reverseAdj.outstanding_difference?.toLocaleString("en-IN")} |
                  Advance {reverseAdj.advance_difference > 0 ? "+" : ""}{reverseAdj.advance_difference?.toLocaleString("en-IN")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reverseAdj && reverseMutation.mutate(reverseAdj)} disabled={reverseMutation.isPending}>
              {reverseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {customerForHistory && (
        <CustomerHistoryDialog
          customerId={customerForHistory.id}
          customerName={customerForHistory.name}
          organizationId={organizationId}
          open={showCustomerHistory}
          onOpenChange={(v) => {
            setShowCustomerHistory(v);
            if (!v) setCustomerForHistory(null);
          }}
        />
      )}
    </>
  );
}
