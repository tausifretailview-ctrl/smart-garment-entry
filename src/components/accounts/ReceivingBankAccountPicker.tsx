import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationBankAccounts } from "@/hooks/useOrganizationBankAccounts";
import {
  formatBankAccountLabel,
  paymentMethodNeedsReceivingBank,
  pickDefaultBankAccountId,
} from "@/utils/organizationBankAccounts";

type ReceivingBankAccountPickerProps = {
  organizationId: string;
  paymentMethod: string;
  value: string | null;
  onChange: (bankAccountId: string | null) => void;
};

export function ReceivingBankAccountPicker({
  organizationId,
  paymentMethod,
  value,
  onChange,
}: ReceivingBankAccountPickerProps) {
  const { accounts, isLoading } = useOrganizationBankAccounts(organizationId);
  const enabled = paymentMethodNeedsReceivingBank(paymentMethod);

  useEffect(() => {
    if (!enabled) {
      if (value) onChange(null);
      return;
    }
    if (isLoading || accounts.length === 0) return;
    if (value && accounts.some((a) => a.id === value)) return;
    onChange(pickDefaultBankAccountId(accounts));
  }, [enabled, isLoading, accounts, value, onChange]);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Bank Account</Label>
        <p className="text-sm text-muted-foreground">Loading bank accounts…</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Bank Account</Label>
        <p className="text-sm text-muted-foreground">
          No bank accounts configured. Add receiving bank accounts in Settings → Company Profile.
        </p>
      </div>
    );
  }

  if (accounts.length === 1) {
    const account = accounts[0];
    return (
      <div className="space-y-2">
        <Label>Bank Account</Label>
        <p className="text-sm font-medium tabular-nums">{formatBankAccountLabel(account)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Bank Account</Label>
      <Select value={value ?? ""} onValueChange={(id) => onChange(id || null)}>
        <SelectTrigger>
          <SelectValue placeholder="Select bank account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {formatBankAccountLabel(account)}
              {account.is_default ? " (default)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
