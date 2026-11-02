import { CheckCircle2, Truck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ewayBillSwitchOn, type EwbApiKeys } from "@/utils/ewayBill";
import { EwayBillApiSettings } from "./EwayBillApiSettings";

/** The e-way bill switch and keys sit in E-Invoice Settings; the API email, test mode and sandbox GSTIN are shared. */
export type EwayBillSettingsValue = EwbApiKeys & {
  ewb_enabled?: boolean;
  enabled?: boolean;
  api_email?: string;
  test_mode?: boolean;
  seller_gstin?: string;
};

type Props = {
  organizationId: string | undefined;
  value: EwayBillSettingsValue | null | undefined;
  /** E-Invoice on: its API email, test mode and sandbox GSTIN (above) are used, so they are not shown again here. */
  einvoiceOn: boolean;
  /** Industrial mode shops with E-Invoice on have e-way bills on until they turn the switch off. */
  industrialOn: boolean;
  onChange: (patch: EwayBillSettingsValue) => void;
};

const WHAT_YOU_GET = [
  "Truck button on the Sales Invoice list: make the e-way bill of a bill in one step",
  "Bills with an e-invoice get it from the IRN; bills without one get it from the bill itself",
  "E-Way Bills register under Sales, with alerts before an e-way bill lapses",
  "A4 e-way bill print with barcode for the driver",
];

/**
 * Settings > Sale: the E-Way Bill on / off switch. Any shop can turn it on, with or without
 * E-Invoice; off (the default) shows nothing new and makes no e-way bill query.
 */
export function EwayBillSettingsSection({ organizationId, value, einvoiceOn, industrialOn, onChange }: Props) {
  const on = ewayBillSwitchOn(value, industrialOn);
  const v = value ?? {};
  const testMode = v.test_mode ?? true;

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
              Make e-way bills inside Ezzy ERP through PeriOne. Needed when goods worth more than ₹50,000 move by vehicle.
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

          {!einvoiceOn ? (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ewb_api_email">PeriOne API email</Label>
                <Input
                  id="ewb_api_email"
                  type="email"
                  className="no-uppercase"
                  value={v.api_email || ""}
                  onChange={(e) => onChange({ api_email: e.target.value.trim() })}
                  placeholder="The email you registered with PeriOne"
                  autoComplete="off"
                />
              </div>
              <div className="flex items-start gap-2 md:col-span-2">
                <Checkbox
                  id="ewb_test_mode"
                  checked={testMode}
                  onCheckedChange={(checked) => onChange({ test_mode: checked === true })}
                />
                <div>
                  <Label htmlFor="ewb_test_mode" className="cursor-pointer font-normal">
                    Test Mode (Sandbox)
                  </Label>
                  <p className="text-xs text-muted-foreground">Uses staging.perione.in. Turn off to make real e-way bills.</p>
                </div>
              </div>
              {testMode ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ewb_seller_gstin">Sandbox GSTIN (optional)</Label>
                  <Input
                    id="ewb_seller_gstin"
                    className="font-mono"
                    value={v.seller_gstin || ""}
                    onChange={(e) => onChange({ seller_gstin: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15) })}
                    placeholder="PeriOne test GSTIN"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to use your Business Details GSTIN.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <EwayBillApiSettings organizationId={organizationId} value={value} einvoiceOn={einvoiceOn} onChange={onChange} />
        </>
      ) : null}
    </div>
  );
}
