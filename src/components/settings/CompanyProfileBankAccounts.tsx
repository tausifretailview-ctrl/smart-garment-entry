import { useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationBankAccounts } from "@/hooks/useOrganizationBankAccounts";
import { formatBankAccountLabel, type OrganizationBankAccount } from "@/utils/organizationBankAccounts";
import { toast } from "sonner";

const emptyForm = () => ({
  bank_name: "",
  account_holder: "",
  account_number: "",
  ifsc_code: "",
  branch: "",
  is_default: false,
});

export function CompanyProfileBankAccounts() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  const canManage = organizationRole === "admin" || organizationRole === "manager";
  const { accounts, isLoading, createAccount, updateAccount, deleteAccount, setDefaultAccount } =
    useOrganizationBankAccounts(orgId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationBankAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationBankAccount | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm(), is_default: accounts.length === 0 });
    setDialogOpen(true);
  };

  const openEdit = (account: OrganizationBankAccount) => {
    setEditing(account);
    setForm({
      bank_name: account.bank_name,
      account_holder: account.account_holder || "",
      account_number: account.account_number || "",
      ifsc_code: account.ifsc_code || "",
      branch: account.branch || "",
      is_default: account.is_default,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!canManage) return;
    const payload = {
      bank_name: form.bank_name,
      account_holder: form.account_holder || null,
      account_number: form.account_number || null,
      ifsc_code: form.ifsc_code || null,
      branch: form.branch || null,
      is_default: form.is_default,
    };
    try {
      if (editing) {
        await updateAccount.mutateAsync({ id: editing.id, input: payload });
        toast.success("Bank account updated");
      } else {
        await createAccount.mutateAsync(payload);
        toast.success("Bank account added");
      }
      setDialogOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save bank account");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canManage) return;
    try {
      await deleteAccount.mutateAsync(deleteTarget.id);
      toast.success("Bank account removed");
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove bank account");
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Receiving Bank Accounts</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Accounts where customer UPI, card, and bank payments are received. Used on Customer Payment Receipt.
          </p>
        </div>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add account
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading bank accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No receiving bank accounts yet.
          {canManage ? " Click Add account to configure one." : ""}
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {formatBankAccountLabel(account)}
                  {account.is_default && (
                    <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">Default</span>
                  )}
                </div>
                {(account.account_holder || account.ifsc_code) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {[account.account_holder, account.ifsc_code].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  {!account.is_default && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Set as default"
                      onClick={() =>
                        setDefaultAccount.mutate(account.id, {
                          onSuccess: () => toast.success("Default bank account updated"),
                          onError: (e) => toast.error(e.message),
                        })
                      }
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(account)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteTarget(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit bank account" : "Add bank account"}</DialogTitle>
            <DialogDescription>Receiving account for customer electronic payments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Bank name *</Label>
              <Input
                value={form.bank_name}
                onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                placeholder="e.g. HDFC Bank"
              />
            </div>
            <div className="space-y-2">
              <Label>Account holder</Label>
              <Input
                value={form.account_holder}
                onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Account number</Label>
                <Input
                  value={form.account_number}
                  onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>IFSC</Label>
                <Input
                  value={form.ifsc_code}
                  onChange={(e) => setForm((f) => ({ ...f, ifsc_code: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Input value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="bank-is-default"
                checked={form.is_default}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_default: checked === true }))}
              />
              <Label htmlFor="bank-is-default" className="cursor-pointer font-normal">
                Default receiving account
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!form.bank_name.trim() || createAccount.isPending || updateAccount.isPending}
            >
              {createAccount.isPending || updateAccount.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatBankAccountLabel(deleteTarget)} will be removed. Existing receipts keep their stored reference.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
