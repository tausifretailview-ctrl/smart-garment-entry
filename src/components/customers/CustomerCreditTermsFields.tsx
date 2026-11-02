import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CustomerCreditTerms } from "@/utils/industrialMode";

export type CustomerCreditTermsForm = {
  credit_limit: string;
  credit_days: string;
  contact_person: string;
  pan_number: string;
};

export const EMPTY_CREDIT_TERMS_FORM: CustomerCreditTermsForm = {
  credit_limit: "",
  credit_days: "",
  contact_person: "",
  pan_number: "",
};

export function creditTermsToForm(t: CustomerCreditTerms | null | undefined): CustomerCreditTermsForm {
  return {
    credit_limit: t?.credit_limit != null ? String(t.credit_limit) : "",
    credit_days: t?.credit_days != null ? String(t.credit_days) : "",
    contact_person: t?.contact_person || "",
    pan_number: t?.pan_number || "",
  };
}

type Props = {
  value: CustomerCreditTermsForm;
  onChange: (next: CustomerCreditTermsForm) => void;
  /** Smaller inputs for the desktop dialog. */
  compact?: boolean;
  idPrefix?: string;
};

/** Customer Master: B2B credit terms block (Industrial mode only). */
export function CustomerCreditTermsFields({ value, onChange, compact, idPrefix = "ct" }: Props) {
  const set = (patch: Partial<CustomerCreditTermsForm>) => onChange({ ...value, ...patch });
  const labelCls = compact ? "text-xs" : undefined;
  const inputCls = compact ? "h-9" : undefined;

  return (
    <fieldset className="rounded-lg border border-primary/25 bg-primary/[0.03] p-3 space-y-2.5">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5" />
        Credit terms
      </legend>
      <div className={cn("grid grid-cols-2 gap-3", compact && "sm:grid-cols-4")}>
        <div>
          <Label htmlFor={`${idPrefix}-credit-limit`} className={labelCls}>Credit limit (₹)</Label>
          <Input
            id={`${idPrefix}-credit-limit`}
            inputMode="decimal"
            value={value.credit_limit}
            onChange={(e) => set({ credit_limit: e.target.value })}
            placeholder="No limit"
            className={cn(inputCls, "tabular-nums")}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-credit-days`} className={labelCls}>Credit days</Label>
          <Input
            id={`${idPrefix}-credit-days`}
            inputMode="numeric"
            value={value.credit_days}
            onChange={(e) => set({ credit_days: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="e.g. 30"
            className={cn(inputCls, "tabular-nums")}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-contact`} className={labelCls}>Contact person</Label>
          <Input
            id={`${idPrefix}-contact`}
            value={value.contact_person}
            onChange={(e) => set({ contact_person: e.target.value })}
            placeholder="Purchase manager"
            className={inputCls}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-pan`} className={labelCls}>PAN</Label>
          <Input
            id={`${idPrefix}-pan`}
            value={value.pan_number}
            onChange={(e) => set({ pan_number: e.target.value.toUpperCase().slice(0, 10) })}
            placeholder="ABCDE1234F"
            className={cn(inputCls, "uppercase")}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Sale Invoice warns when a credit bill takes this party over the limit, and sets the due date from credit days.
      </p>
    </fieldset>
  );
}
