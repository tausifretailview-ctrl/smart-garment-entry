import { useState } from "react";
import { ChevronDown, FileText, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TRANSPORT_MODE_LABEL,
  formatCustomerPoRef,
  formatSaleTransportLine,
  parseSaleB2BForm,
  type SaleB2BDetailsForm,
  type TransportMode,
} from "@/utils/industrialMode";

type Props = {
  value: SaleB2BDetailsForm;
  onChange: (next: SaleB2BDetailsForm) => void;
  /** Customer Master "Transport" text, shown as a hint for Transporter. */
  customerTransport?: string | null;
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

/** Sale Invoice (Industrial mode): customer PO and dispatch details, one tidy band under the header. */
export function SaleB2BDetailsBand({ value, onChange, customerTransport, className }: Props) {
  const [open, setOpen] = useState(readOpen);
  const set = (patch: Partial<SaleB2BDetailsForm>) => onChange({ ...value, ...patch });

  let summary = "";
  try {
    const parsed = parseSaleB2BForm(value);
    summary = [formatCustomerPoRef(parsed) && `PO ${formatCustomerPoRef(parsed)}`, formatSaleTransportLine(parsed)]
      .filter(Boolean)
      .join("  ·  ");
  } catch {
    summary = "Check the details";
  }

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
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block";

  return (
    <div className={cn("rounded-md border border-sky-200 bg-sky-50/60", className)} data-testid="sale-b2b-band">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md"
        aria-expanded={open}
      >
        <Truck className="h-4 w-4 text-sky-700 shrink-0" />
        <span className="text-[13px] font-bold text-sky-900">Order &amp; dispatch</span>
        <span className="text-xs text-slate-500 truncate min-w-0 flex-1">
          {summary || "Customer PO, transporter, vehicle, LR, distance"}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-9 gap-2.5">
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
      )}
    </div>
  );
}
