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
} from "@/utils/organizationBankAccounts";

const NONE_BANK_VALUE = "__none__";

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
    if (!enabled && value) onChange(null);
  }, [enabled, value, onChange]);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Bank Account (optional)</Label>
        <p className="text-sm text-muted-foreground">Loading bank accounts…</p>
      </div>
    );
  }

  if ((accounts ?? []).length === 0) {
    return (
      <div className="space-y-2">
        <Label>Bank Account (optional)</Label>
        <p className="text-sm text-muted-foreground">
          Not configured — you can still collect UPI, card, or bank transfer. Add accounts in
          Settings → Company Profile to track which bank received funds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Bank Account (optional)</Label>
      <Select
        value={value ?? NONE_BANK_VALUE}
        onValueChange={(id) => onChange(id === NONE_BANK_VALUE ? null : id)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Not specified" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_BANK_VALUE}>Not specified</SelectItem>
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
