import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  deleteJournalEntryByReference,
  recordExpenseVoucherJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

export const EXPENSE_PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

/** Minimal expense voucher shape needed to edit or delete it. */
export interface ExpenseVoucherLike {
  id: string;
  voucher_number?: string | null;
  voucher_date?: string | null;
  category?: string | null;
  description?: string | null;
  payment_method?: string | null;
  total_amount?: number | string | null;
  paid_by?: string | null;
  receipt_number?: string | null;
}

interface ExpenseSnapshot {
  voucher_date: string;
  category: string | null;
  description: string | null;
  payment_method: string;
  total_amount: number;
  paid_by: string | null;
  receipt_number: string | null;
}

async function isLedgerPostingOn(organizationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return isAccountingEngineEnabled(data as { accounting_engine_enabled?: boolean } | null);
}

/**
 * Edit / delete for expense vouchers, shared by the Accounts Expenses tab and the
 * Payments page history. Gated by the User Rights "Modify Records" / "Delete Records"
 * special rights (org admins without custom rights have both).
 */
export function useExpenseVoucherActions(organizationId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasSpecialPermission } = useUserPermissions();
  const canModify = hasSpecialPermission("modify_records");
  const canDelete = hasSpecialPermission("delete_records");

  const { data: categories } = useQuery({
    queryKey: ["expense-categories", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, ledger_account_id")
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && enabled,
  });

  const [editing, setEditing] = useState<ExpenseVoucherLike | null>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editCategory, setEditCategory] = useState("");
  const [editPayment, setEditPayment] = useState("cash");
  const [editAmount, setEditAmount] = useState("");
  const [editNarration, setEditNarration] = useState("");
  const [editPaidBy, setEditPaidBy] = useState("");
  const [editBillNo, setEditBillNo] = useState("");
  const [deleting, setDeleting] = useState<ExpenseVoucherLike | null>(null);

  const ledgerIdFor = (categoryName: string | null) =>
    categories?.find((c) => c.name === categoryName)?.ledger_account_id ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expense-vouchers"] });
    queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
    queryClient.invalidateQueries({ queryKey: ["expense-category-usage", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
  };

  const writeVoucher = async (id: string, snap: ExpenseSnapshot) => {
    const { error } = await supabase
      .from("voucher_entries")
      .update(snap)
      .eq("id", id)
      .eq("organization_id", organizationId!);
    if (error) throw error;
  };

  const postJournal = (id: string, snap: ExpenseSnapshot) =>
    recordExpenseVoucherJournalEntry(
      id,
      organizationId!,
      snap.total_amount,
      snap.payment_method,
      snap.voucher_date,
      snap.description || snap.category || "Expense",
      supabase,
      ledgerIdFor(snap.category),
    );

  const updateExpense = useMutation({
    mutationFn: async () => {
      if (!editing || !organizationId) return;
      const amount = parseFloat(editAmount);
      if (!editCategory.trim()) throw new Error("Please select an expense category");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Please enter a valid amount");

      const before: ExpenseSnapshot = {
        voucher_date: editing.voucher_date || format(new Date(), "yyyy-MM-dd"),
        category: editing.category ?? null,
        description: editing.description ?? null,
        payment_method: editing.payment_method || "cash",
        total_amount: Number(editing.total_amount) || 0,
        paid_by: editing.paid_by ?? null,
        receipt_number: editing.receipt_number ?? null,
      };
      const after: ExpenseSnapshot = {
        voucher_date: format(editDate, "yyyy-MM-dd"),
        category: editCategory.trim(),
        description: editNarration.trim() || editCategory.trim(),
        payment_method: editPayment,
        total_amount: amount,
        paid_by: editPaidBy.trim() || null,
        receipt_number: editBillNo.trim() || null,
      };

      const postLedger = await isLedgerPostingOn(organizationId);
      await writeVoucher(editing.id, after);
      if (!postLedger) return;

      // Replace the day book entry; if the new one cannot be posted, put the
      // voucher and its old entry back so cash and ledger stay in step.
      try {
        await deleteJournalEntryByReference(organizationId, "ExpenseVoucher", editing.id, supabase);
        await postJournal(editing.id, after);
      } catch (jErr) {
        try {
          await writeVoucher(editing.id, before);
          await deleteJournalEntryByReference(organizationId, "ExpenseVoucher", editing.id, supabase);
          await postJournal(editing.id, before);
        } catch (rollbackErr) {
          console.error("Expense edit rollback failed", rollbackErr);
        }
        throw jErr;
      }
    },
    onSuccess: () => {
      toast.success("Expense updated");
      refresh();
      setEditing(null);
    },
    onError: (error: any) => toast.error(error?.message || "Could not update expense"),
  });

  // Soft delete: moves the voucher to the Recycle Bin (restore reposts its journal).
  const deleteExpense = useMutation({
    mutationFn: async (voucher: ExpenseVoucherLike) => {
      if (!organizationId) return;
      const postLedger = await isLedgerPostingOn(organizationId);
      const { error } = await supabase
        .from("voucher_entries")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", voucher.id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      if (!postLedger) return;
      try {
        await deleteJournalEntryByReference(organizationId, "ExpenseVoucher", voucher.id, supabase);
      } catch (jErr) {
        await supabase
          .from("voucher_entries")
          .update({ deleted_at: null, deleted_by: null })
          .eq("id", voucher.id)
          .eq("organization_id", organizationId);
        throw jErr;
      }
    },
    onSuccess: () => {
      toast.success("Expense deleted (moved to Recycle Bin)");
      refresh();
      setDeleting(null);
    },
    onError: (error: any) => toast.error(error?.message || "Could not delete expense"),
  });

  const openEdit = (v: ExpenseVoucherLike) => {
    if (!canModify) {
      toast.error("You don't have the Modify Records right");
      return;
    }
    setEditing(v);
    setEditDate(v.voucher_date ? new Date(v.voucher_date) : new Date());
    setEditCategory(v.category || v.description || "");
    setEditPayment(v.payment_method || "cash");
    setEditAmount(String(v.total_amount ?? ""));
    setEditNarration(v.description || "");
    setEditPaidBy(v.paid_by || "");
    setEditBillNo(v.receipt_number || "");
  };

  const requestDelete = (v: ExpenseVoucherLike) => {
    if (!canDelete) {
      toast.error("You don't have the Delete Records right");
      return;
    }
    setDeleting(v);
  };

  const categoryOptions = (() => {
    const names = (categories || []).map((c) => c.name);
    if (editCategory && !names.includes(editCategory)) names.unshift(editCategory);
    return names;
  })();

  const dialogs = (
    <>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Expense</DialogTitle>
            <DialogDescription className="text-xs">Voucher: {editing?.voucher_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-xs h-9">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(editDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={(d) => d && setEditDate(d)}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((name) => (
                    <SelectItem key={name} value={name} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={editPayment} onValueChange={setEditPayment}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Narration</Label>
              <Input value={editNarration} onChange={(e) => setEditNarration(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Paid By</Label>
                <Input value={editPaidBy} onChange={(e) => setEditPaidBy(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bill/Receipt No</Label>
                <Input value={editBillNo} onChange={(e) => setEditBillNo(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => updateExpense.mutate()} disabled={updateExpense.isPending}>
              {updateExpense.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete Expense?</DialogTitle>
            <DialogDescription className="text-xs">
              {deleting?.voucher_number} ({deleting?.category || deleting?.description || "Expense"}, ₹
              {Number(deleting?.total_amount || 0).toLocaleString("en-IN")}) will be moved to the Recycle
              Bin and removed from the day book. You can restore it from the Recycle Bin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleting && deleteExpense.mutate(deleting)}
              disabled={deleteExpense.isPending}
            >
              {deleteExpense.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { canModify, canDelete, openEdit, requestDelete, dialogs };
}
