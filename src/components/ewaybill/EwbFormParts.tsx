import { AlertTriangle, CheckCircle2, Info, Loader2, Printer } from "lucide-react";
import { EwayBillActions } from "@/components/ewaybill/EwayBillActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GSTIN_STATE_NAMES } from "@/utils/gstRegisterUtils";
import {
  ewbAlertKind,
  ewbCancelUntil,
  ewbExtendUntil,
  ewbValidity,
  formatEwbNo,
  formatIstDateTime,
  type EwayBillRow,
  type EwbTransportForm,
} from "@/utils/ewayBill";
import { EWB_MODE_LABEL, type EwbDirectField, type EwbProblemField, type EwbTransportMode } from "../../../supabase/functions/_shared/ewayBill";

/** Shared pieces of the e-way bill windows of a sale bill and a delivery challan. */

export const EWB_MODES: EwbTransportMode[] = ["road", "rail", "air", "ship"];
export const ewbField = "h-9 text-sm bg-white";
export const ewbLabel = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block";
export const EWB_STATES = Object.entries(GSTIN_STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

/** Where the goods go (direct e-way bill): starts from the buyer's address and GSTIN. */
export type EwbShipToForm = { pin: string; place: string; stateCode: string };

/** Red outline for the field the last problem was about. */
export type EwbBadField = (f: EwbProblemField | EwbDirectField) => string;

function transDocLabel(mode: EwbTransportMode): string {
  return mode === "rail" ? "RR no" : mode === "air" ? "AWB no" : mode === "ship" ? "Bill of lading no" : "LR / docket no";
}

/** Mode, distance, vehicle, transporter and LR of a new e-way bill. */
export function EwbTransportFields({
  form,
  set,
  bad,
  days,
}: {
  form: EwbTransportForm;
  set: (patch: Partial<EwbTransportForm>) => void;
  bad: EwbBadField;
  days: number | null;
}) {
  const field = ewbField;
  const label = ewbLabel;
  return (
    <>
      <div>
        <span className={label}>Mode</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {EWB_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set({ mode: m })}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors",
                form.mode === m ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {EWB_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ewb-distance" className={label}>Distance km</label>
          <Input
            id="ewb-distance"
            inputMode="numeric"
            className={cn(field, "tabular-nums", bad("distance"))}
            value={form.distanceKm}
            onChange={(e) => set({ distanceKm: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
            placeholder="Auto from PIN codes"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {days ? `Valid about ${days} day${days > 1 ? "s" : ""} (to midnight)` : "Blank: the IRP works it out"}
          </p>
        </div>
        {form.mode === "road" ? (
          <>
            <div>
              <label htmlFor="ewb-vehicle" className={label}>Vehicle no</label>
              <Input
                id="ewb-vehicle"
                className={cn(field, "uppercase font-mono text-[13px]", bad("vehicle"))}
                value={form.vehicleNo}
                onChange={(e) => set({ vehicleNo: e.target.value.toUpperCase() })}
                placeholder="MH04AB1234"
              />
            </div>
            <div>
              <label htmlFor="ewb-vtype" className={label}>Vehicle type</label>
              <Select value={form.vehicleType} onValueChange={(v) => set({ vehicleType: v === "O" ? "O" : "R" })}>
                <SelectTrigger id="ewb-vtype" className={field}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  <SelectItem value="R">Regular</SelectItem>
                  <SelectItem value="O">Over-dimensional cargo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ewb-transporter-id" className={label}>Transporter ID</label>
          <Input
            id="ewb-transporter-id"
            className={cn(field, "uppercase font-mono text-[13px]", bad("transporter"))}
            value={form.transporterId}
            onChange={(e) => set({ transporterId: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15) })}
            placeholder="GSTIN / TRANSIN"
          />
        </div>
        <div>
          <label htmlFor="ewb-transporter" className={label}>Transporter name</label>
          <Input
            id="ewb-transporter"
            className={cn(field, "no-uppercase")}
            value={form.transporterName}
            onChange={(e) => set({ transporterName: e.target.value })}
            placeholder="VRL Logistics"
          />
        </div>
        <div>
          <label htmlFor="ewb-doc" className={label}>{transDocLabel(form.mode)}</label>
          <Input
            id="ewb-doc"
            className={cn(field, bad("transDoc"))}
            value={form.transDocNo}
            onChange={(e) => set({ transDocNo: e.target.value })}
            placeholder={form.mode === "road" ? "Optional" : "Needed"}
          />
        </div>
        <div>
          <label htmlFor="ewb-doc-date" className={label}>{form.mode === "road" ? "LR date" : "Document date"}</label>
          <Input
            id="ewb-doc-date"
            type="date"
            className={cn(field, bad("transDocDate"))}
            value={form.transDocDate}
            onChange={(e) => set({ transDocDate: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

/** Town, PIN and state the goods go to (direct e-way bill). */
export function EwbShipToFields({
  shipTo,
  setS,
  bad,
  hint,
}: {
  shipTo: EwbShipToForm;
  setS: (patch: Partial<EwbShipToForm>) => void;
  bad: EwbBadField;
  hint: string;
}) {
  const field = ewbField;
  const label = ewbLabel;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-700">Goods go to</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ewb-to-place" className={label}>Town</label>
          <Input
            id="ewb-to-place"
            className={cn(field, "no-uppercase", bad("toPlace"))}
            value={shipTo.place}
            onChange={(e) => setS({ place: e.target.value })}
            placeholder="Surat"
          />
        </div>
        <div>
          <label htmlFor="ewb-to-pin" className={label}>PIN</label>
          <Input
            id="ewb-to-pin"
            inputMode="numeric"
            className={cn(field, "tabular-nums", bad("toPin"))}
            value={shipTo.pin}
            onChange={(e) => setS({ pin: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
            placeholder="395002"
          />
        </div>
        <div>
          <label htmlFor="ewb-to-state" className={label}>State</label>
          <Select value={shipTo.stateCode} onValueChange={(v) => setS({ stateCode: v })}>
            <SelectTrigger id="ewb-to-state" className={cn(field, bad("toState"))}>
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent className="z-[60] max-h-72">
              {EWB_STATES.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {code} {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

/** The e-way bill a document already has: number, validity, alerts, vehicle / extend / cancel, and print. */
export function EwbActiveCard({
  organizationId,
  active,
  docDate,
  onDone,
  onPrint,
  printing,
}: {
  organizationId: string;
  active: EwayBillRow;
  docDate: string | null;
  onDone: () => void;
  onPrint: () => void;
  printing: boolean;
}) {
  const validity = ewbValidity(active);
  const alertKind = ewbAlertKind(active);
  const extendUntil = ewbExtendUntil(active.valid_till);
  const cancelUntil = ewbCancelUntil(active);
  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> E-way bill
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tracking-wider text-slate-900">{formatEwbNo(active.ewb_no)}</div>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-2">
        <div>Made: <span className="font-medium text-slate-800">{formatIstDateTime(active.ewb_date) || "—"}</span></div>
        <div>
          <span
            className={cn(
              "font-medium",
              validity.tone === "expired" ? "text-red-600" : validity.tone === "soon" || validity.tone === "partA" ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {validity.label}
          </span>
        </div>
        {active.vehicle_no ? <div>Vehicle: <span className="font-mono font-medium text-slate-800">{active.vehicle_no}</span></div> : null}
        {active.transporter_name || active.transporter_id ? (
          <div className="truncate">
            Transporter: <span className="font-medium text-slate-800">{active.transporter_name || active.transporter_id}</span>
          </div>
        ) : null}
        {active.distance_km ? <div>Distance: <span className="font-medium text-slate-800">{active.distance_km} km</span></div> : null}
      </div>
      {alertKind === "extend" && extendUntil ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Lapsed. If the goods are still on the way, extend it by {formatIstDateTime(extendUntil)}.
        </p>
      ) : alertKind === "soon" ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Lapses within 8 hours. If the goods won't reach in time, extend it.
        </p>
      ) : alertKind === "partA" ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-sky-50 px-2 py-1.5 text-[11px] font-medium text-sky-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          No vehicle yet. Add it before the goods move.
        </p>
      ) : null}
      <EwayBillActions key={active.id} organizationId={organizationId} ewb={active} docDate={docDate} onDone={onDone} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          {cancelUntil ? `Can be cancelled till ${formatIstDateTime(cancelUntil)}.` : "Cancel window (24 hours) has passed."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-emerald-200 bg-white text-xs text-emerald-800 hover:bg-emerald-50"
          onClick={onPrint}
          disabled={printing}
        >
          {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          Print e-way bill
        </Button>
      </div>
    </div>
  );
}
