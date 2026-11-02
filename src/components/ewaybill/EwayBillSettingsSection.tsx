import { CheckCircle2, Truck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ewayBillSwitchOn, type EwbApiKeys } from "@/utils/ewayBill";
import { EwayBillApiSettings } from "./EwayBillApiSettings";

export type EwayBillSettingsValue = EwbApiKeys & { ewb_enabled?: boolean };

type Props = {
  organizationId: string | undefined;
  /** The shop's E-Invoice Settings; the e-way bill switch and keys sit beside the e-invoice ones. */
  value: EwayBillSettingsValue | null | undefined;
  /** Industrial mode shops have e-way bills on until they turn the switch off. */
  industrialOn: boolean;
  onChange: (patch: EwayBillSettingsValue) => void;
};

const WHAT_YOU_GET = [
  "Truck button on the Sales Invoice list: make the e-way bill from the bill's e-invoice in one step",
  "E-Way Bills register under Sales, with alerts before an e-way bill lapses",
  "A4 e-way bill print with barcode for the driver",
];

/**
 * Settings > Sale > E-Invoice: the E-Way Bill on / off switch. Any shop with E-Invoice on can
 * turn it on; off (the default) shows nothing new and makes no e-way bill query.
 */
export function EwayBillSettingsSection({ organizationId, value, industrialOn, onChange }: Props) {
  const on = ewayBillSwitchOn(value, industrialOn);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <Label htmlFor="ewb_enabled" className="cursor-pointer text-base font-semibold">
              Enable E-Way Bill
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Make e-way bills from your e-invoices (IRN) inside Ezzy ERP. Needed when goods worth more than ₹50,000
              move by vehicle.
            </p>
          </div>
        </div>
        <Switch id="ewb_enabled" checked={on} onCheckedChange={(checked) => onChange({ ewb_enabled: checked === true })} />
      </div>

      {on ? (
        <>
          <ul className="space-y-1.5 pl-1 text-xs text-slate-600">
            {WHAT_YOU_GET.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                {line}
              </li>
            ))}
          </ul>
          <EwayBillApiSettings organizationId={organizationId} value={value} onChange={onChange} />
        </>
      ) : null}
    </div>
  );
}
