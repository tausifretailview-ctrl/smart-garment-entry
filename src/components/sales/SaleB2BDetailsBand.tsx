import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FileText, Globe2, Info, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SALE_SUPPLY_TYPES,
  TRANSPORT_MODE_LABEL,
  formatCustomerPoRef,
  formatSaleTransportLine,
  isExportSupply,
  isSezSupply,
  isSupplyWithoutTax,
  isZeroRatedSupply,
  parseSaleB2BForm,
  saleSupplyShortLabel,
  type SaleB2BDetailsForm,
  type SaleSupplyType,
  type TransportMode,
} from "@/utils/industrialMode";

type Props = {
  value: SaleB2BDetailsForm;
  onChange: (next: SaleB2BDetailsForm) => void;
  /** Customer Master "Transport" text, shown as a hint for Transporter. */
  customerTransport?: string | null;
  /** Selected customer's GSTIN, to warn when it does not fit the supply type. */
  customerGstin?: string | null;
  /** GST on the bill now: an LUT (no IGST) bill must have none. */
  billGst?: number;
  /** Sets GST 0% on every line (LUT bills). */
  onZeroGst?: () => void;
  className?: string;
};

const OPEN_KEY = "ezzy.saleB2BBand.open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Supply type for the Sale Invoice header row (Industrial mode). */
export function SaleSupplyTypeField({
  value,
  onChange,
  className,
}: {
  value: SaleSupplyType;
  onChange: (next: SaleSupplyType) => void;
  className?: string;
}) {
  const picked = SALE_SUPPLY_TYPES.find((t) => t.value === value);
  return (
    <div className={className}>
      <label htmlFor="b2b-supply" className="text-[13px] font-medium text-muted-foreground mb-1 block truncate">
        <Globe2 className="inline h-3 w-3 mr-1 -mt-0.5" />
        Supply type
      </label>
      <Select value={value} onValueChange={(v) => onChange(v as SaleSupplyType)}>
        <SelectTrigger
          id="b2b-supply"
          title={picked?.label}
          className={cn("h-10 text-sm", value !== "B2B" && "border-sky-400 bg-sky-50 font-semibold text-sky-900")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-50">
          {SALE_SUPPLY_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Sale Invoice (Industrial mode): customer PO and dispatch details in one row under the header.
 * The supply type sits in the header row (SaleSupplyTypeField); this band reads it for its hints.
 */
export function SaleB2BDetailsBand({ value, onChange, customerTransport, customerGstin, billGst = 0, onZeroGst, className }: Props) {
  const [open, setOpen] = useState(readOpen);
  const set = (patch: Partial<SaleB2BDetailsForm>) => onChange({ ...value, ...patch });
  const supply = value.supply_type || "B2B";
  const exportBill = isExportSupply(supply);
  const gstin = String(customerGstin ?? "").trim();

  let summary = "";
  try {
    const parsed = parseSaleB2BForm(value);
    summary = [
      saleSupplyShortLabel(supply),
      formatCustomerPoRef(parsed) && `PO ${formatCustomerPoRef(parsed)}`,
      formatSaleTransportLine(parsed),
    ]
      .filter(Boolean)
      .join("  ·  ");
  } catch {
    summary = "Check the details";
  }

  // Plain warnings; the e-invoice service gives the final word.
  const warnings: string[] = [];
  if (isSupplyWithoutTax(supply) && billGst > 0.005) {
    warnings.push(`Under LUT the bill must not charge GST, but it has ₹${billGst.toFixed(2)}. Set GST 0% on the lines.`);
  }
  if (exportBill && gstin) warnings.push("This customer has an Indian GSTIN. An export bill is for a buyer abroad: pick SEZ if it is an SEZ unit.");
  if (isSezSupply(supply) && !gstin) warnings.push("An SEZ unit has a GSTIN. Add it to this customer before the e-invoice.");

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* per-browser convenience only */
    }
  };

  const field = "h-9 text-sm bg-white";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 block truncate";

  return (
    <div className={cn("rounded-md border border-sky-200 bg-sky-50/60", className)} data-testid="sale-b2b-band">
      {!open ? (
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md"
          aria-expanded={false}
        >
          <Truck className="h-4 w-4 text-sky-700 shrink-0" />
          <span className="text-[13px] font-bold text-sky-900">Order &amp; dispatch</span>
          <span className="text-xs text-slate-500 truncate min-w-0 flex-1">
            {summary || "Customer PO, transporter, vehicle, LR, distance"}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </button>
      ) : null}

      {open && isZeroRatedSupply(supply) ? (
        <p className="mx-3 mt-2 flex items-start gap-1.5 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5 mt-px shrink-0 text-sky-600" />
          {isSupplyWithoutTax(supply)
            ? "Zero-rated under LUT / bond: no GST on this bill. The print carries the LUT line."
            : "IGST on this bill, even within the state. The print carries the export / SEZ line."}
        </p>
      ) : null}

      {open && warnings.length > 0 && (
        <div className="mx-3 mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 flex flex-col gap-1">
          {warnings.map((w) => (
            <div key={w} className="flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1">{w}</span>
            </div>
          ))}
          {isSupplyWithoutTax(supply) && billGst > 0.005 && onZeroGst ? (
            <button
              type="button"
              onClick={onZeroGst}
              className="self-start rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
            >
              Set GST 0% on all lines
            </button>
          ) : null}
        </div>
      )}

      {open && exportBill && (
        <div className="px-3 pt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 border-b border-sky-100 pb-2">
          <div>
            <label htmlFor="b2b-sb-no" className={label}>Shipping bill no</label>
            <Input
              id="b2b-sb-no"
              className={field}
              value={value.ship_bill_no}
              onChange={(e) => set({ ship_bill_no: e.target.value.slice(0, 20) })}
              placeholder="Fill when known"
            />
          </div>
          <div>
            <label htmlFor="b2b-sb-date" className={label}>Shipping bill date</label>
            <Input id="b2b-sb-date" type="date" className={field} value={value.ship_bill_date} onChange={(e) => set({ ship_bill_date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="b2b-port" className={label}>Port code</label>
            <Input
              id="b2b-port"
              className={cn(field, "uppercase font-mono text-[13px]")}
              value={value.port_code}
              onChange={(e) => set({ port_code: e.target.value.toUpperCase().slice(0, 10) })}
              placeholder="INNSA1"
            />
          </div>
          <div>
            <label htmlFor="b2b-country" className={label}>Country</label>
            <Input
              id="b2b-country"
              className={cn(field, "uppercase font-mono text-[13px]")}
              value={value.country_code}
              onChange={(e) => set({ country_code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })}
              placeholder="AE"
            />
          </div>
          <div>
            <label htmlFor="b2b-currency" className={label}>Currency</label>
            <Input
              id="b2b-currency"
              className={cn(field, "uppercase font-mono text-[13px]")}
              value={value.currency}
              onChange={(e) => set({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) })}
              placeholder="USD"
            />
          </div>
          <div>
            <label htmlFor="b2b-fc-value" className={label}>Value in currency</label>
            <Input
              id="b2b-fc-value"
              inputMode="decimal"
              className={cn(field, "tabular-nums")}
              value={value.foreign_value}
              onChange={(e) => set({ foreign_value: e.target.value.replace(/[^0-9.]/g, "").slice(0, 16) })}
              placeholder="6250.00"
            />
          </div>
        </div>
      )}

      {open && (
        <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggle}
          title="Order & dispatch: hide these fields"
          aria-label="Hide order and dispatch details"
          aria-expanded
          className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-l-md border-r border-sky-200 px-2 text-sky-700 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <Truck className="h-4 w-4" />
          <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
        </button>
        <div className="min-w-0 flex-1 px-3 pt-1.5 pb-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-9 gap-x-2.5 gap-y-2">
          <div className="col-span-1">
            <label htmlFor="b2b-po-no" className={label}>
              <FileText className="inline h-3 w-3 mr-1 -mt-0.5" />
              Customer PO no
            </label>
            <Input id="b2b-po-no" className={field} value={value.customer_po_no} onChange={(e) => set({ customer_po_no: e.target.value })} placeholder="PO-7781" />
          </div>
          <div>
            <label htmlFor="b2b-po-date" className={label}>PO date</label>
            <Input id="b2b-po-date" type="date" className={field} value={value.customer_po_date} onChange={(e) => set({ customer_po_date: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-2 xl:col-span-1">
            <label htmlFor="b2b-transporter" className={label}>Transporter</label>
            <Input
              id="b2b-transporter"
              className={field}
              value={value.transporter_name}
              onChange={(e) => set({ transporter_name: e.target.value })}
              placeholder={customerTransport?.trim() || "VRL Logistics"}
            />
          </div>
          <div>
            <label htmlFor="b2b-transporter-id" className={label}>Transporter ID</label>
            <Input
              id="b2b-transporter-id"
              className={cn(field, "uppercase font-mono text-[13px]")}
              value={value.transporter_id}
              onChange={(e) => set({ transporter_id: e.target.value.toUpperCase().slice(0, 15) })}
              placeholder="GSTIN / TRANSIN"
            />
          </div>
          <div>
            <label htmlFor="b2b-mode" className={label}>Mode</label>
            <Select value={value.transport_mode} onValueChange={(v) => set({ transport_mode: v as TransportMode })}>
              <SelectTrigger id="b2b-mode" className={field}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50">
                {(Object.keys(TRANSPORT_MODE_LABEL) as TransportMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {TRANSPORT_MODE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="b2b-vehicle" className={label}>Vehicle no</label>
            <Input
              id="b2b-vehicle"
              className={cn(field, "uppercase font-mono text-[13px]")}
              value={value.vehicle_no}
              onChange={(e) => set({ vehicle_no: e.target.value.toUpperCase() })}
              placeholder="MH04AB1234"
            />
          </div>
          <div>
            <label htmlFor="b2b-lr" className={label}>LR / docket no</label>
            <Input id="b2b-lr" className={field} value={value.lr_no} onChange={(e) => set({ lr_no: e.target.value })} placeholder="55821" />
          </div>
          <div>
            <label htmlFor="b2b-lr-date" className={label}>LR date</label>
            <Input id="b2b-lr-date" type="date" className={field} value={value.lr_date} onChange={(e) => set({ lr_date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="b2b-distance" className={label}>Distance km</label>
            <Input
              id="b2b-distance"
              inputMode="numeric"
              className={cn(field, "tabular-nums")}
              value={value.distance_km}
              onChange={(e) => set({ distance_km: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
              placeholder="142"
            />
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
