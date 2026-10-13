import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  deleteSupplierPaymentVoucher,
  splitPaymentSiblings,
  type SupplierPaymentVoucherLike,
} from "@/utils/supplierPaymentDelete";

/** Query keys that show supplier dues, bill paid status or the day book. */
export function invalidateSupplierPaymentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "voucher-entries",
    "supplier-bills",
    "supplier-balance",
    "supplier-balance-snapshot",
    "supplier-balance-map",
    "suppliers-with-balance",
    "supplier-ledger",
    "supplier-bill-payment-voucher-drift",
    "purchase-bills",
    "purchase-summary",
    "journal-vouchers",
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Delete for supplier payment vouchers (Accounts > Supplier Payment list and the
 * Payments page history). Gated by the User Rights "Delete Records" special right.
 * A split payment (PAY/…/872-1, -2) deletes only the part clicked.
 */
export function useSupplierPaymentDelete(
  organizationId: string | undefined,
  allVouchers?: SupplierPaymentVoucherLike[],
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasSpecialPermission } = useUserPermissions();
  const canDelete = hasSpecialPermission("delete_records");
  const [deleting, setDeleting] = useState<SupplierPaymentVoucherLike | null>(null);

  /** Raw delete without toasts, for bulk loops. Callers refresh queries afterwards. */
  const deleteOne = (voucher: SupplierPaymentVoucherLike) => {
    if (!organizationId) throw new Error("No organization");
    return deleteSupplierPaymentVoucher(voucher, organizationId, user?.id ?? null, supabase);
  };

  const deleteMutation = useMutation({
    mutationFn: deleteOne,
    onSuccess: () => {
      toast.success("Payment deleted (moved to Recycle Bin)");
      setDeleting(null);
    },
    onError: (error: any) => toast.error(error?.message || "Could not delete payment"),
    onSettled: () => invalidateSupplierPaymentQueries(queryClient),
  });

  const requestDelete = (v: SupplierPaymentVoucherLike) => {
    if (!canDelete) {
      toast.error("You don't have the Delete Records right");
      return;
    }
    setDeleting(v);
  };

  const siblings = deleting ? splitPaymentSiblings(deleting, allVouchers) : [];
  const amount =
    Number(deleting?.total_amount || 0) + Number(deleting?.discount_amount || 0);

  const dialog = (
    <Dialog open={!!deleting} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleting(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Delete Supplier Payment?</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              {deleting?.voucher_number} (₹{amount.toLocaleString("en-IN")}) will be moved to the Recycle Bin.
              The bill it paid goes back to pending, the supplier balance and ledger go up by this amount,
              and its day book entry is removed. You can restore it from the Recycle Bin.
            </span>
            {siblings.length > 0 && (
              <span className="block text-amber-700 dark:text-amber-400">
                This payment was split across bills. Only {deleting?.voucher_number} is deleted;{" "}
                {siblings.map((s) => s.voucher_number).join(", ")} stay. To remove the whole payment, delete
                each part.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDeleting(null)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleting && deleteMutation.mutate(deleting)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { canDelete, requestDelete, deleteOne, dialog };
}
