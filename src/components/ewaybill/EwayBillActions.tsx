import { useMemo, useState } from "react";
import { Ban, CalendarClock, Info, Loader2, Truck } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GSTIN_STATE_NAMES } from "@/utils/gstRegisterUtils";
import {
  ewbApiKeysSet,
  ewbCancelUntil,
  ewbSellerPlace,
  formatEwbNo,
  formatIstDateTime,
  invokeEwayBill,
  type EwayBillRow,
} from "@/utils/ewayBill";
import {
  EWB_CANCEL_REASONS,
  EWB_EXTEND_REASONS,
  EWB_MODE_LABEL,
  EWB_TRANSIT_LABEL,
  EWB_VEHICLE_REASONS,
  buildEwbCancelPayload,
  buildEwbExtendPayload,
  buildEwbVehiclePayload,
  ewbExtendWindow,
  isEwbTransportMode,
  type EwbApiField,
  type EwbApiPayloadResult,
  type EwbTransitType,
  type EwbTransportMode,
} from "../../../supabase/functions/_shared/ewayBill";
import { indiaTodayIso } from "../../../supabase/functions/_shared/einvoiceNote";

type Props = {
  organizationId: string;
  ewb: EwayBillRow;
  /** Bill date, yyyy-mm-dd. */
  docDate: string | null;
  onDone: () => void;
};

type Panel = "vehicle" | "extend" | "cancel" | null;

const MODES: EwbTransportMode[] = ["road", "rail", "air", "ship"];
const STATES = Object.entries(GSTIN_STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
const field = "h-9 text-sm bg-white";
const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block";

function docLabel(mode: EwbTransportMode): string {
  return mode === "rail" ? "RR no" : mode === "air" ? "AWB no" : mode === "ship" ? "Bill of lading no" : "LR / docket no";
}

/** Industrial mode, Phase 2 step 5b: add or change the vehicle, extend or cancel one e-way bill. */
export function EwayBillActions({ organizationId, ewb, docDate, onDone }: Props) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const s = settings as {
    address?: string | null;
    gst_number?: string | null;
    sale_settings?: { einvoice_settings?: Record<string, unknown> | null } | null;
  } | null;
  const einv = s?.sale_settings?.einvoice_settings ?? null;
  const keysSet = ewbApiKeysSet(einv);
  const seller = useMemo(
    () => ewbSellerPlace(s?.address, String((einv as { seller_gstin?: string } | null)?.seller_gstin || s?.gst_number || "")),
    [s?.address, s?.gst_number, einv],
  );

  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field: EwbApiField | null; error: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const startMode: EwbTransportMode = isEwbTransportMode(ewb.trans_mode) ? ewb.trans_mode : "road";
  const [veh, setVeh] = useState({
    mode: startMode,
    vehicleNo: "",
    transDocNo: "",
    transDocDate: "",
    fromPlace: seller.place,
    fromStateCode: seller.stateCode,
    reasonCode: ewb.vehicle_no ? "1" : "4",
    remark: "",
  });
  const [ext, setExt] = useState({
    consignment: "M" as "M" | "T",
    mode: startMode,
    vehicleNo: ewb.vehicle_no ?? "",
    transDocNo: ewb.trans_doc_no ?? "",
    transDocDate: ewb.trans_doc_date ?? "",
    fromPlace: "",
    fromPincode: "",
    fromStateCode: seller.stateCode,
    remainingKm: "",
    reasonCode: "",
    remark: "",
    transitType: "R" as EwbTransitType,
    address1: "",
    address2: "",
    address3: "",
  });
  const [can, setCan] = useState({ reasonCode: "", remark: "" });

  const now = new Date();
  const cancelUntil = ewbCancelUntil(ewb, now);
  const win = ewbExtendWindow(ewb.valid_till);
  const extendOpen = !!win && now.getTime() >= Date.parse(win.from) && now.getTime() <= Date.parse(win.to);

  if (!keysSet) {
    return (
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        To change the vehicle, extend or cancel it from here, add the e-way bill keys from PeriOne in Settings &gt; E-Invoice
        Settings. Until then, use the e-way bill portal.
      </p>
    );
  }

  const open = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    setProblem(null);
    setConfirmCancel(false);
    // Settings may load after the window opened: fill the shop's town and state if still blank.
    if (p === "vehicle") {
      setVeh((x) => ({ ...x, fromPlace: x.fromPlace || seller.place, fromStateCode: x.fromStateCode || seller.stateCode }));
    } else if (p === "extend") {
      setExt((x) => ({ ...x, fromStateCode: x.fromStateCode || seller.stateCode }));
    }
  };
  const bad = (f: EwbApiField) => (problem?.field === f ? "border-red-400 ring-1 ring-red-200" : "");

  const submit = async (action: "vehicle" | "extend" | "cancel") => {
    if (busy) return;
    const today = indiaTodayIso();
    let built: EwbApiPayloadResult;
    if (action === "vehicle") {
      built = buildEwbVehiclePayload({ ewbNo: ewb.ewb_no, docDate, today, input: { ...veh, reasonRemark: veh.remark } });
    } else if (action === "extend") {
      built = buildEwbExtendPayload({ ewbNo: ewb.ewb_no, input: ext, validTill: ewb.valid_till, distanceKm: ewb.distance_km, docDate, today });
    } else {
      built = buildEwbCancelPayload({ ewbNo: ewb.ewb_no, reasonCode: can.reasonCode, remark: can.remark, ewbDate: ewb.ewb_date });
    }
    if (built.ok === false) {
      // The app's tsconfig is not strict, so the union is not narrowed here.
      const f = built as { field: EwbApiField; error: string };
      setProblem({ field: f.field, error: f.error });
      return;
    }
    if (action === "cancel" && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const res = await invokeEwayBill({
        action,
        organizationId,
        ewayBillId: ewb.id,
        ...(action === "vehicle"
          ? { vehicle: { ...veh, reasonRemark: veh.remark } }
          : action === "extend"
            ? { extend: ext }
            : { cancel: { reasonCode: can.reasonCode, remark: can.remark } }),
      });
      if (res.success) {
        toast({
          title: res.message || "Done",
          description:
            action === "cancel"
              ? `E-way bill ${formatEwbNo(ewb.ewb_no)} is cancelled.`
              : res.validTill
                ? `${formatEwbNo(ewb.ewb_no)} valid till ${formatIstDateTime(res.validTill)}.`
                : `E-way bill ${formatEwbNo(ewb.ewb_no)} updated.`,
        });
        setPanel(null);
        setConfirmCancel(false);
        onDone();
      } else {
        setProblem({ field: (res.field as EwbApiField | undefined) ?? null, error: res.error || "The e-way bill system did not accept it" });
        setConfirmCancel(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const tab = (p: Exclude<Panel, null>, text: string, Icon: typeof Truck, disabled: boolean, title?: string) => (
    <button
      type="button"
      onClick={() => open(p)}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        panel === p
          ? p === "cancel"
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-teal-300 bg-teal-50 text-teal-800"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {text}
    </button>
  );

  const stateSelect = (value: string, onValue: (v: string) => void, id: string) => (
    <Select value={value} onValueChange={onValue}>
      <SelectTrigger id={id} className={cn(field, bad("state"))}>
        <SelectValue placeholder="State" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {STATES.map(([code, name]) => (
          <SelectItem key={code} value={code}>
            {code} · {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const modeButtons = (value: EwbTransportMode, onValue: (m: EwbTransportMode) => void) => (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onValue(m)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
            value === m ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {EWB_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );

  const transportFields = (
    v: { mode: EwbTransportMode; vehicleNo: string; transDocNo: string; transDocDate: string },
    set: (patch: Partial<{ mode: EwbTransportMode; vehicleNo: string; transDocNo: string; transDocDate: string }>) => void,
    prefix: string,
  ) => (
    <>
      <div className="sm:col-span-3">
        <span className={label}>Mode</span>
        {modeButtons(v.mode, (m) => set({ mode: m }))}
      </div>
      <div>
        <label htmlFor={`${prefix}-veh`} className={label}>Vehicle no</label>
        <Input
          id={`${prefix}-veh`}
          className={cn(field, "font-mono uppercase", bad("vehicle"))}
          value={v.vehicleNo}
          onChange={(e) => set({ vehicleNo: e.target.value.toUpperCase() })}
          placeholder={v.mode === "road" ? "MH12AB1234" : "Optional"}
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-doc`} className={label}>{docLabel(v.mode)}</label>
        <Input
          id={`${prefix}-doc`}
          className={cn(field, bad("transDoc"))}
          value={v.transDocNo}
          onChange={(e) => set({ transDocNo: e.target.value })}
          placeholder={v.mode === "road" ? "Optional" : "Needed"}
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-docdt`} className={label}>Its date</label>
        <Input
          id={`${prefix}-docdt`}
          type="date"
          className={cn(field, bad("transDocDate"))}
          value={v.transDocDate}
          onChange={(e) => set({ transDocDate: e.target.value })}
        />
      </div>
    </>
  );

  const setV = (patch: Partial<typeof veh>) => {
    setVeh((x) => ({ ...x, ...patch }));
    setProblem(null);
  };
  const setE = (patch: Partial<typeof ext>) => {
    setExt((x) => ({ ...x, ...patch }));
    setProblem(null);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tab("vehicle", ewb.vehicle_no || ewb.trans_doc_no ? "Change vehicle" : "Add vehicle", Truck, busy)}
        {tab(
          "extend",
          "Extend",
          CalendarClock,
          busy || !extendOpen,
          win ? `Can be extended from ${formatIstDateTime(win.from)} to ${formatIstDateTime(win.to)}` : "Add the vehicle first",
        )}
        {tab("cancel", "Cancel", Ban, busy || !cancelUntil, cancelUntil ? `Can be cancelled till ${formatIstDateTime(cancelUntil)}` : "Only within 24 hours of being made")}
        {!extendOpen && win && !panel ? (
          <span className="text-[11px] text-slate-400">Extend opens {formatIstDateTime(win.from).slice(0, 16)}</span>
        ) : null}
      </div>

      {panel === "vehicle" ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-teal-200 bg-white p-3 sm:grid-cols-3">
          {transportFields(veh, setV, "ewbv")}
          <div>
            <label htmlFor="ewbv-place" className={label}>Starts from</label>
            <Input id="ewbv-place" className={cn(field, bad("place"))} value={veh.fromPlace} onChange={(e) => setV({ fromPlace: e.target.value })} placeholder="Town" />
          </div>
          <div>
            <span className={label}>State</span>
            {stateSelect(veh.fromStateCode, (v) => setV({ fromStateCode: v }), "ewbv-state")}
          </div>
          <div>
            <span className={label}>Reason</span>
            <Select value={veh.reasonCode} onValueChange={(v) => setV({ reasonCode: v })}>
              <SelectTrigger className={cn(field, bad("reason"))}>
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent>
                {EWB_VEHICLE_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="ewbv-rem" className={label}>Remark {veh.reasonCode === "3" ? "" : "(optional)"}</label>
            <Input id="ewbv-rem" className={cn(field, bad("remark"))} value={veh.remark} maxLength={50} onChange={(e) => setV({ remark: e.target.value })} />
          </div>
        </div>
      ) : null}

      {panel === "extend" ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-teal-200 bg-white p-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <span className={label}>Goods are</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(["M", "T"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setE({ consignment: c })}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                    ext.consignment === c ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {c === "M" ? "Moving" : "Stopped (in transit)"}
                </button>
              ))}
            </div>
          </div>
          {ext.consignment === "M" ? (
            transportFields(ext, setE, "ewbx")
          ) : (
            <>
              <div>
                <span className={label}>Where</span>
                <Select value={ext.transitType} onValueChange={(v) => setE({ transitType: v as EwbTransitType })}>
                  <SelectTrigger className={field}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EWB_TRANSIT_LABEL) as EwbTransitType[]).map((t) => (
                      <SelectItem key={t} value={t}>{EWB_TRANSIT_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ewbx-a1" className={label}>Address where the goods are</label>
                <Input id="ewbx-a1" className={cn(field, bad("address"))} value={ext.address1} maxLength={50} onChange={(e) => setE({ address1: e.target.value })} placeholder="Line 1" />
              </div>
              <div className="sm:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input className={cn(field, bad("address"))} value={ext.address2} maxLength={50} onChange={(e) => setE({ address2: e.target.value })} placeholder="Line 2" aria-label="Address line 2" />
                <Input className={cn(field, bad("address"))} value={ext.address3} maxLength={50} onChange={(e) => setE({ address3: e.target.value })} placeholder="Line 3" aria-label="Address line 3" />
              </div>
            </>
          )}
          <div>
            <label htmlFor="ewbx-place" className={label}>Goods now at</label>
            <Input id="ewbx-place" className={cn(field, bad("place"))} value={ext.fromPlace} onChange={(e) => setE({ fromPlace: e.target.value })} placeholder="Town" />
          </div>
          <div>
            <label htmlFor="ewbx-pin" className={label}>PIN code</label>
            <Input
              id="ewbx-pin"
              inputMode="numeric"
              className={cn(field, "tabular-nums", bad("pin"))}
              value={ext.fromPincode}
              onChange={(e) => setE({ fromPincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            />
          </div>
          <div>
            <span className={label}>State</span>
            {stateSelect(ext.fromStateCode, (v) => setE({ fromStateCode: v }), "ewbx-state")}
          </div>
          <div>
            <label htmlFor="ewbx-km" className={label}>Km still to go</label>
            <Input
              id="ewbx-km"
              inputMode="numeric"
              className={cn(field, "tabular-nums", bad("distance"))}
              value={ext.remainingKm}
              onChange={(e) => setE({ remainingKm: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            />
          </div>
          <div>
            <span className={label}>Reason</span>
            <Select value={ext.reasonCode} onValueChange={(v) => setE({ reasonCode: v })}>
              <SelectTrigger className={cn(field, bad("reason"))}>
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent>
                {EWB_EXTEND_REASONS.map((r) => (
                  <SelectItem key={r.code} value={String(r.code)}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="ewbx-rem" className={label}>Remark {ext.reasonCode === "99" ? "" : "(optional)"}</label>
            <Input id="ewbx-rem" className={cn(field, bad("remark"))} value={ext.remark} maxLength={50} onChange={(e) => setE({ remark: e.target.value })} />
          </div>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-red-200 bg-white p-3 sm:grid-cols-3">
          <div>
            <span className={label}>Reason</span>
            <Select value={can.reasonCode} onValueChange={(v) => { setCan((c) => ({ ...c, reasonCode: v })); setProblem(null); setConfirmCancel(false); }}>
              <SelectTrigger className={cn(field, bad("reason"))}>
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent>
                {EWB_CANCEL_REASONS.map((r) => (
                  <SelectItem key={r.code} value={String(r.code)}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ewbc-rem" className={label}>Remark {can.reasonCode === "4" ? "" : "(optional)"}</label>
            <Input
              id="ewbc-rem"
              className={cn(field, bad("remark"))}
              value={can.remark}
              maxLength={50}
              onChange={(e) => { setCan((c) => ({ ...c, remark: e.target.value })); setProblem(null); setConfirmCancel(false); }}
            />
          </div>
          {cancelUntil ? (
            <p className="sm:col-span-3 text-[11px] text-slate-500">
              Can be cancelled till {formatIstDateTime(cancelUntil)}. A cancelled e-way bill can't be used again; the bill can then get a new one.
            </p>
          ) : null}
        </div>
      ) : null}

      {problem ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{problem.error}</div>
      ) : null}

      {panel ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => open(null)} disabled={busy}>
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(
              "text-white",
              panel === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700",
            )}
            onClick={() => void submit(panel)}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {panel === "vehicle"
              ? "Save vehicle"
              : panel === "extend"
                ? "Extend validity"
                : confirmCancel
                  ? `Yes, cancel ${formatEwbNo(ewb.ewb_no)}`
                  : "Cancel e-way bill"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
