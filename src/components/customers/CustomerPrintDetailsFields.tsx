import { useState } from "react";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  composePrintAddress,
  hasPrintAddress,
  readCustomerPrintDetails,
  type CustomerPrintDetails,
} from "@/lib/customerPrintDetails";

/**
 * Customer Master → "Print on bill": name and address printed on bills when they differ from the
 * name used to find the customer. Folded away until opened or filled; shows what the bill prints.
 */
export function CustomerPrintDetailsFields({
  value,
  onChange,
  customerName,
  customerAddress,
  idPrefix = "print",
}: {
  value: CustomerPrintDetails;
  onChange: (next: CustomerPrintDetails) => void;
  /** The search name and address, shown in the preview while the print fields are blank. */
  customerName: string;
  customerAddress: string;
  idPrefix?: string;
}) {
  const filled = Boolean(value.print_name) || hasPrintAddress(readCustomerPrintDetails(value));
  const [open, setOpen] = useState(filled);
  const show = open || filled;
  const set = (key: keyof CustomerPrintDetails, v: string) => onChange({ ...value, [key]: v });
  const id = (key: string) => `${idPrefix}-${key}`;
  const clean = readCustomerPrintDetails(value);
  const previewName = clean.print_name || customerName.trim() || "—";
  const previewAddress = composePrintAddress(clean) || customerAddress.trim();

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-900"
        aria-expanded={show}
        onClick={() => setOpen((o) => !o)}
      >
        {show ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Printer className="h-4 w-4 text-muted-foreground" />
        Print on bill
        <span className="font-normal text-muted-foreground">
          {filled ? "· different name / address set" : "· optional, when the bill name differs"}
        </span>
      </button>
      {show ? (
        <div className="space-y-3 border-t border-slate-200 p-3">
          <p className="text-xs text-muted-foreground">
            Leave blank to print the customer name and address above.
          </p>
          <div>
            <Label htmlFor={id("name")} className="text-xs">Print name</Label>
            <Input
              id={id("name")}
              value={value.print_name}
              onChange={(e) => set("print_name", e.target.value)}
              placeholder="e.g. M/s. R. C. KAMLAPURE"
              maxLength={160}
              className="h-9"
            />
          </div>
          <div>
            <Label htmlFor={id("address")} className="text-xs">Address</Label>
            <Textarea
              id={id("address")}
              value={value.print_address}
              onChange={(e) => set("print_address", e.target.value)}
              placeholder="Building, street, area"
              maxLength={400}
              className="min-h-[56px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor={id("place")} className="text-xs">Place / City</Label>
              <Input id={id("place")} value={value.print_place} onChange={(e) => set("print_place", e.target.value)} maxLength={80} className="h-9" />
            </div>
            <div>
              <Label htmlFor={id("pincode")} className="text-xs">Pincode</Label>
              <Input
                id={id("pincode")}
                inputMode="numeric"
                value={value.print_pincode}
                onChange={(e) => set("print_pincode", e.target.value.replace(/[^\d ]/g, ""))}
                maxLength={12}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor={id("state")} className="text-xs">State</Label>
              <Input id={id("state")} value={value.print_state} onChange={(e) => set("print_state", e.target.value)} maxLength={60} className="h-9" />
            </div>
            <div>
              <Label htmlFor={id("country")} className="text-xs">Country</Label>
              <Input
                id={id("country")}
                value={value.print_country}
                onChange={(e) => set("print_country", e.target.value)}
                placeholder="INDIA"
                maxLength={60}
                className="h-9"
              />
            </div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs" aria-label="Bill preview">
            <div className="mb-0.5 font-medium text-muted-foreground">On the bill:</div>
            <div className="font-semibold text-slate-900">{previewName}</div>
            {previewAddress ? <div className="whitespace-pre-line text-slate-700">{previewAddress}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
