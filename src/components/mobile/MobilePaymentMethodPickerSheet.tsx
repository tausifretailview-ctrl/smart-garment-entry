import {
  Banknote,
  CreditCard,
  Smartphone,
  FileText,
  Building2,
  MoreHorizontal,
  Globe,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobilePickerSheet } from "./MobilePickerSheet";

export interface PaymentMethodOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  accentClass?: string;
}

export const DEFAULT_RECEIPT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: "cash", label: "Cash", icon: Banknote, accentClass: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { value: "upi", label: "UPI", icon: Smartphone, accentClass: "bg-violet-600 hover:bg-violet-700 text-white" },
  { value: "card", label: "Card", icon: CreditCard, accentClass: "bg-cyan-600 hover:bg-cyan-700 text-white" },
  { value: "cheque", label: "Cheque", icon: FileText, accentClass: "bg-amber-600 hover:bg-amber-700 text-white" },
  { value: "bank_transfer", label: "Bank Transfer", icon: Building2, accentClass: "bg-slate-600 hover:bg-slate-700 text-white" },
  { value: "online", label: "Online", icon: Globe, accentClass: "bg-indigo-600 hover:bg-indigo-700 text-white" },
  { value: "other", label: "Other", icon: MoreHorizontal, accentClass: "bg-muted-foreground hover:bg-muted-foreground/90 text-white" },
];

interface MobilePaymentMethodPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  methods?: PaymentMethodOption[];
  title?: string;
}

export function MobilePaymentMethodPickerSheet({
  open,
  onOpenChange,
  value,
  onChange,
  methods = DEFAULT_RECEIPT_PAYMENT_METHODS,
  title = "Payment method",
}: MobilePaymentMethodPickerSheetProps) {
  const handlePick = (methodValue: string) => {
    onChange(methodValue);
    onOpenChange(false);
  };

  const selected = methods.find((m) => m.value === value);

  return (
    <MobilePickerSheet open={open} onOpenChange={onOpenChange} title={title}>
      {selected ? (
        <p className="text-xs text-muted-foreground mb-3">
          Current: <span className="font-medium text-foreground">{selected.label}</span>
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        {methods.map((method) => {
          const Icon = method.icon ?? Banknote;
          const isSelected = value === method.value;
          return (
            <button
              key={method.value}
              type="button"
              onClick={() => handlePick(method.value)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 h-14 rounded-xl text-xs font-semibold touch-manipulation active:scale-[0.98] transition-transform",
                method.accentClass ?? "bg-primary text-primary-foreground",
                isSelected && "ring-2 ring-offset-2 ring-offset-background ring-foreground/80"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{method.label}</span>
              {isSelected ? (
                <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5" />
              ) : null}
            </button>
          );
        })}
      </div>
    </MobilePickerSheet>
  );
}
