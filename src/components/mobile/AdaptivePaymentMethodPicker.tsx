import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronsUpDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RECEIPT_PAYMENT_METHODS,
  MobilePaymentMethodPickerSheet,
  type PaymentMethodOption,
} from "./MobilePaymentMethodPickerSheet";

interface AdaptivePaymentMethodPickerProps {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  methods?: PaymentMethodOption[];
  triggerClassName?: string;
  sheetTitle?: string;
  /** Controlled sheet open (optional) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const methodLabel = (methods: PaymentMethodOption[], value: string) =>
  methods.find((m) => m.value === value)?.label ?? value;

export function AdaptivePaymentMethodPicker({
  label,
  value,
  onChange,
  methods = DEFAULT_RECEIPT_PAYMENT_METHODS,
  triggerClassName,
  sheetTitle,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: AdaptivePaymentMethodPickerProps) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  if (!isMobile) {
    return (
      <div className="space-y-2">
        {label ? <Label>{label}</Label> : null}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {methods.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      <Button
        type="button"
        variant="outline"
        className={cn("w-full justify-between font-normal", triggerClassName)}
        onClick={() => setOpen(true)}
      >
        <span>{methodLabel(methods, value)}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      <MobilePaymentMethodPickerSheet
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={onChange}
        methods={methods}
        title={sheetTitle}
      />
    </div>
  );
}
