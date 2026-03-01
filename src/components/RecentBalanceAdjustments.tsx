import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { History, Loader2, Pencil, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const PAGE_SIZE = 10;

interface Props {
  organizationId: string;
}

export function RecentBalanceAdjustments({ organizationId }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [editAdj, setEditAdj] = useState<any>(null);
  const [editReason, setEditReason] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

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

  const adjustments = data || [];
  const totalPages = Math.max(1, Math.ceil(adjustments.length / PAGE_SIZE));
  const paged = adjustments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const updateMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .update({ reason })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-balance-adjustments"] });
      toast.success("Adjustment reason updated");
      setEditAdj(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update"),
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
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !adjustments.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No adjustments made yet.</p>
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
                            <p className="font-medium text-sm">{adj.customers?.customer_name || "—"}</p>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(adj)} title="Modify">
                              <Pencil className="h-4 w-4" />
                            </Button>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages} ({adjustments.length} records)
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

      {/* Edit Reason Dialog */}
      <Dialog open={!!editAdj} onOpenChange={(v) => !v && setEditAdj(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Modify Adjustment Reason</DialogTitle>
          </DialogHeader>
          {editAdj && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {editAdj.customers?.customer_name} — {format(new Date(editAdj.created_at), "dd/MM/yyyy HH:mm")}
              </p>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdj(null)}>Cancel</Button>
            <Button
              onClick={() => editAdj && updateMutation.mutate({ id: editAdj.id, reason: editReason })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
