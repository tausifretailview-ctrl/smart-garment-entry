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
import { Loader2, ArrowRight, Check } from "lucide-react";
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
    if (suppliers.length !== 2) return "";
    // Prefer the one with more data (opening balance, GST, etc.)
    const score = (s: SupplierInfo) =>
      (s.opening_balance ? 1 : 0) + (s.gst_number ? 1 : 0) + (s.phone ? 1 : 0) + (s.email ? 1 : 0);
    return score(suppliers[0]) >= score(suppliers[1]) ? suppliers[0].id : suppliers[1].id;
  };

  const effectiveTargetId = targetId || getDefaultTarget();
  const target = suppliers.find((s) => s.id === effectiveTargetId);
  const source = suppliers.find((s) => s.id !== effectiveTargetId);

  const handleMerge = async () => {
    if (!target || !source) return;
    setIsMerging(true);
    try {
      const { data, error } = await supabase.rpc("merge_suppliers", {
        p_target_supplier_id: target.id,
        p_source_supplier_id: source.id,
      });

      if (error) throw error;

      const result = data as any;
      toast.success(
        `Merged "${source.supplier_name}" into "${target.supplier_name}" — ${result.purchases_moved} purchases, ${result.orders_moved} orders, ${result.returns_moved} returns reassigned`
      );
      onOpenChange(false);
      onMergeComplete();
    } catch (error: any) {
      toast.error(error.message || "Merge failed");
    } finally {
      setIsMerging(false);
    }
  };

  if (suppliers.length !== 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Suppliers</DialogTitle>
          <DialogDescription>
            Select which supplier to keep. The other will be merged into it — all purchases, orders, and returns will be reassigned.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start py-4">
          {suppliers.map((supplier, idx) => {
            const isTarget = supplier.id === effectiveTargetId;
            return (
              <div key={supplier.id} className="contents">
                {idx === 1 && (
                  <div className="flex items-center justify-center self-center">
                    <ArrowRight className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setTargetId(supplier.id)}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
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
              </div>
            );
          })}
        </div>

        {target && source && (
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p>All purchase bills, orders, and returns from "{source.supplier_name}" will be reassigned to "{target.supplier_name}".</p>
            <p>Opening balances will be consolidated (₹{((target.opening_balance || 0) + (source.opening_balance || 0)).toLocaleString()}).</p>
            <p className="text-destructive font-medium">"{source.supplier_name}" will be soft-deleted after merge.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>Cancel</Button>
          <Button onClick={handleMerge} disabled={isMerging || !target || !source}>
            {isMerging ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Merging...</>) : "Confirm Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
