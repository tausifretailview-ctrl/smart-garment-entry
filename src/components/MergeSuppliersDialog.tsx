import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupplierInfo {
  id: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  supplier_code: string | null;
  opening_balance: number | null;
}

interface MergeSuppliersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierInfo[];
  onMergeComplete: () => void;
}

export const MergeSuppliersDialog = ({
  open,
  onOpenChange,
  suppliers,
  onMergeComplete,
}: MergeSuppliersDialogProps) => {
  const [targetId, setTargetId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);

  const getDefaultTarget = () => {
    if (suppliers.length < 2) return "";
    const score = (s: SupplierInfo) =>
      (s.opening_balance ? 1 : 0) + (s.gst_number ? 1 : 0) + (s.phone ? 1 : 0) + (s.email ? 1 : 0);
    return suppliers.reduce((best, s) => (score(s) > score(best) ? s : best), suppliers[0]).id;
  };

  const effectiveTargetId = targetId || getDefaultTarget();
  const target = suppliers.find((s) => s.id === effectiveTargetId);
  const sources = suppliers.filter((s) => s.id !== effectiveTargetId);

  const handleMerge = async () => {
    if (!target || sources.length === 0) return;
    setIsMerging(true);
    try {
      let totalPurchases = 0, totalOrders = 0, totalReturns = 0;

      for (const source of sources) {
        const { data, error } = await supabase.rpc("merge_suppliers", {
          p_target_supplier_id: target.id,
          p_source_supplier_id: source.id,
        });
        if (error) throw error;
        const result = data as any;
        totalPurchases += result.purchases_moved || 0;
        totalOrders += result.orders_moved || 0;
        totalReturns += result.returns_moved || 0;
      }

      toast.success(
        `Merged ${sources.length} supplier(s) into "${target.supplier_name}" — ${totalPurchases} purchases, ${totalOrders} orders, ${totalReturns} returns reassigned`
      );
      onOpenChange(false);
      onMergeComplete();
    } catch (error: any) {
      toast.error(error.message || "Merge failed");
    } finally {
      setIsMerging(false);
    }
  };

  if (suppliers.length < 2) return null;

  const consolidatedBalance = suppliers.reduce((sum, s) => sum + (s.opening_balance || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge {suppliers.length} Suppliers</DialogTitle>
          <DialogDescription>
            Select which supplier to keep. All others will be merged into it — purchases, orders, returns, and payments will be reassigned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4 max-h-[40vh] overflow-y-auto">
          {suppliers.map((supplier) => {
            const isTarget = supplier.id === effectiveTargetId;
            return (
              <button
                key={supplier.id}
                type="button"
                onClick={() => setTargetId(supplier.id)}
                className={cn(
                  "w-full rounded-lg border-2 p-4 text-left transition-all",
                  isTarget
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground">{supplier.supplier_name}</span>
                  {isTarget ? (
                    <Badge className="gap-1"><Check className="h-3 w-3" /> Keep</Badge>
                  ) : (
                    <Badge variant="secondary">Will merge</Badge>
                  )}
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {supplier.contact_person && <p>Contact: {supplier.contact_person}</p>}
                  {supplier.phone && <p>Phone: {supplier.phone}</p>}
                  {supplier.gst_number && <p>GST: {supplier.gst_number}</p>}
                  {supplier.supplier_code && <p>Code: {supplier.supplier_code}</p>}
                  <p className="font-medium text-foreground">
                    Opening Bal: ₹{(supplier.opening_balance || 0).toLocaleString()}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {target && sources.length > 0 && (
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p>All purchase bills, orders, payments, and returns from {sources.length} supplier(s) will be reassigned to "{target.supplier_name}".</p>
            <p>Opening balances will be consolidated (₹{consolidatedBalance.toLocaleString()}).</p>
            <p className="text-destructive font-medium">
              {sources.map(s => `"${s.supplier_name}"`).join(", ")} will be soft-deleted after merge.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>Cancel</Button>
          <Button onClick={handleMerge} disabled={isMerging || !target || sources.length === 0}>
            {isMerging ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Merging...</>) : `Merge ${sources.length} into Target`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
