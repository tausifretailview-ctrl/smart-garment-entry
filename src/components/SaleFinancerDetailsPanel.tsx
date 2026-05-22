import { CreditCard } from "lucide-react";

/** Display shape for sale_financer_details (invoice + POS dashboard). */
export interface SaleFinancerDetailsDisplay {
  financer_name: string;
  loan_number?: string | null;
  emi_amount?: number | null;
  tenure?: number | null;
  down_payment?: number | null;
  down_payment_mode?: string | null;
  bank_transfer_amount?: number | null;
  finance_discount?: number | null;
}

export function mapSaleFinancerRow(row: Record<string, unknown> | null | undefined): SaleFinancerDetailsDisplay | null {
  if (!row?.financer_name || typeof row.financer_name !== "string") return null;
  return {
    financer_name: row.financer_name,
    loan_number: (row.loan_number as string) || null,
    emi_amount: Number(row.emi_amount) || 0,
    tenure: Number(row.tenure) || 0,
    down_payment: Number(row.down_payment) || 0,
    down_payment_mode: (row.down_payment_mode as string) || null,
    bank_transfer_amount: Number(row.bank_transfer_amount) || 0,
    finance_discount: Number(row.finance_discount) || 0,
  };
}

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const downPaymentModeLabel = (mode?: string | null) => {
  if (!mode) return "";
  const m = mode.toLowerCase();
  if (m === "upi") return "UPI";
  if (m === "card") return "Card";
  return "Cash";
};

interface SaleFinancerDetailsPanelProps {
  details: SaleFinancerDetailsDisplay | null | undefined;
  /** compact = single row grid for table expand; default = card */
  variant?: "card" | "compact";
}

export function SaleFinancerDetailsPanel({ details, variant = "card" }: SaleFinancerDetailsPanelProps) {
  if (!details?.financer_name) return null;

  const fields: { label: string; value: string }[] = [
    { label: "Financer", value: details.financer_name },
  ];
  if (details.loan_number) {
    fields.push({ label: "DSBS No", value: details.loan_number });
  }
  if (details.down_payment != null && details.down_payment > 0) {
    const mode = downPaymentModeLabel(details.down_payment_mode);
    fields.push({
      label: "Down Payment",
      value: mode ? `${fmt(details.down_payment)} (${mode})` : fmt(details.down_payment),
    });
  }
  if (details.bank_transfer_amount != null && details.bank_transfer_amount > 0) {
    fields.push({ label: "Bank Transfer", value: fmt(details.bank_transfer_amount) });
  }
  if (details.emi_amount != null && details.emi_amount > 0) {
    fields.push({ label: "EMI Amount", value: fmt(details.emi_amount) });
  }
  if (details.tenure != null && details.tenure > 0) {
    fields.push({ label: "Tenure", value: `${details.tenure} Months` });
  }
  if (details.finance_discount != null && details.finance_discount > 0) {
    fields.push({ label: "Finance Discount", value: fmt(details.finance_discount) });
  }

  const gridClass =
    variant === "compact"
      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2"
      : "grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2";

  return (
    <div
      className={
        variant === "compact"
          ? "rounded-md border border-primary/25 bg-primary/[0.04] px-3 py-2.5"
          : "rounded-md border border-primary/30 bg-primary/5 p-3"
      }
    >
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-3.5 w-3.5 text-primary shrink-0" />
        <h4 className="font-semibold text-[13px] underline decoration-primary/40">Finance / EMI Details</h4>
      </div>
      <div className={gridClass}>
        {fields.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
            <p className="text-sm font-medium text-foreground tabular-nums truncate" title={value}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
