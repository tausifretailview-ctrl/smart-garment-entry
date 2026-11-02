import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Loader2, Printer, RefreshCw, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEwayBillPrinter } from "@/hooks/useEwayBillPrinter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GSTIN_STATE_NAMES } from "@/utils/gstRegisterUtils";
import {
  EMPTY_PORT_FORM,
  ewbFormFromB2b,
  ewbPortInput,
  ewbAlertKind,
  ewbCancelUntil,
  ewbExtendUntil,
  ewbTransportInput,
  ewbValidity,
  formatEwbNo,
  formatIstDateTime,
  invokeEwayBill,
  type EwayBillRow,
  type EwbPortForm,
  type EwbTransportForm,
} from "@/utils/ewayBill";
import {
  EWB_MODE_LABEL,
  EWB_VALUE_LIMIT,
  buildEwbByIrnPayload,
  ewbDistance,
  ewbValidityDays,
  type EwbProblemField,
  type EwbTransportMode,
} from "../../../supabase/functions/_shared/ewayBill";
import { indiaTodayIso, irpSupplyTypeOf, isExportSupplyType } from "../../../supabase/functions/_shared/einvoiceNote";

export type EwbSaleInfo = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number | null;
  customer_name: string | null;
  irn: string | null;
  einvoice_status: string | null;
  einvoice_test_mode?: boolean | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  sale: EwbSaleInfo | null;
  ewayBill: EwayBillRow | null;
  missingSql: boolean;
  onChanged: () => void;
};

const MODES: EwbTransportMode[] = ["road", "rail", "air", "ship"];
const field = "h-9 text-sm bg-white";
const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block";
const STATES = Object.entries(GSTIN_STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

function docLabel(mode: EwbTransportMode): string {
  return mode === "rail" ? "RR no" : mode === "air" ? "AWB no" : mode === "ship" ? "Bill of lading no" : "LR / docket no";
}

function inr(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/** E-way bill of one e-invoiced sale bill: make it from the IRN, or see the one it has. */
export function SaleEwayBillDialog({ open, onOpenChange, organizationId, sale, ewayBill, missingSql, onChanged }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<EwbTransportForm>(() => ewbFormFromB2b(null));
  const [port, setPort] = useState<EwbPortForm>(EMPTY_PORT_FORM);
  const [problem, setProblem] = useState<{ field: EwbProblemField | null; error: string } | null>(null);
  const [busy, setBusy] = useState<"generate" | "sync" | null>(null);
  const printer = useEwayBillPrinter(organizationId);
  const queryClient = useQueryClient();

  // The bill's B2B details (transport, export) are read here so the list query stays as it is.
  const { data: b2b, isLoading: b2bLoading } = useQuery({
    queryKey: ["sale-b2b-details", organizationId, sale?.id ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("b2b_details")
        .eq("id", sale!.id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return ((data as { b2b_details?: unknown } | null)?.b2b_details ?? null) as unknown;
    },
    enabled: open && !!sale?.id,
    staleTime: 30_000,
  });

  // Start once per opening from the bill's saved transport details; a later refetch keeps what was typed.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSeededFor(null);
      return;
    }
    if (!sale?.id || b2bLoading || seededFor === sale.id) return;
    setForm(ewbFormFromB2b(b2b ?? null));
    setPort(EMPTY_PORT_FORM);
    setProblem(null);
    setSeededFor(sale.id);
  }, [open, sale?.id, b2b, b2bLoading, seededFor]);

  const isExport = isExportSupplyType(irpSupplyTypeOf(b2b ?? null));
  const set = (patch: Partial<EwbTransportForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };
  const setP = (patch: Partial<EwbPortForm>) => {
    setPort((p) => ({ ...p, ...patch }));
    setProblem(null);
  };

  const days = useMemo(() => ewbValidityDays(ewbDistance(form.distanceKm), form.vehicleType), [form.distanceKm, form.vehicleType]);

  if (!sale) return printer.printNode;
  const active = ewayBill && ewayBill.status === "active" ? ewayBill : null;
  const testMode = sale.einvoice_test_mode ?? null;
  const belowLimit = Number(sale.net_amount ?? 0) <= EWB_VALUE_LIMIT;
  const hasIrn = !!sale.irn && sale.einvoice_status === "generated";

  const run = async (action: "generate" | "sync") => {
    if (busy) return;
    if (action === "generate") {
      const built = buildEwbByIrnPayload({
        irn: sale.irn,
        docDate: String(sale.sale_date ?? "").slice(0, 10),
        today: indiaTodayIso(),
        transport: ewbTransportInput(form),
        exportPort: ewbPortInput(port),
        isExport,
      });
      if (built.ok === false) {
        // The app's tsconfig is not strict, so the union is not narrowed here.
        const fail = built as { field: EwbProblemField; error: string };
        setProblem({ field: fail.field, error: fail.error });
        return;
      }
    }
    setBusy(action);
    try {
      const res = await invokeEwayBill({
        action,
        saleId: sale.id,
        organizationId,
        ...(action === "generate" ? { transport: ewbTransportInput(form), exportPort: isExport ? ewbPortInput(port) : undefined } : {}),
      });
      if (res.success) {
        toast({
          title: res.found ? "E-way bill found at the IRP" : "E-way bill generated",
          description: `${sale.sale_number}: EWB ${formatEwbNo(res.ewbNo)}${
            res.partAOnly ? ". Add the vehicle on the portal before the goods move." : ""
          }`,
        });
        onOpenChange(false);
      } else if (action === "sync" && res.code === "NOT_FOUND") {
        toast({ title: "No e-way bill yet", description: res.error });
      } else {
        setProblem({ field: res.field ?? null, error: res.error || "The IRP did not accept it" });
      }
    } finally {
      setBusy(null);
      onChanged();
      // The register and the lapse alerts read the same table.
      void queryClient.invalidateQueries({ queryKey: ["eway-bill-alerts", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["eway-bill-register", organizationId] });
    }
  };

  const bad = (f: EwbProblemField) => (problem?.field === f ? "border-red-400 ring-1 ring-red-200" : "");
  const validity = active ? ewbValidity(active) : null;
  const alertKind = active ? ewbAlertKind(active) : null;
  const extendUntil = active ? ewbExtendUntil(active.valid_till) : null;
  const cancelUntil = active ? ewbCancelUntil(active) : null;

  return (
    <>
    {printer.printNode}
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                E-way bill · {sale.sale_number}
                {testMode !== null ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      testMode ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {testMode ? "Sandbox" : "Live"}
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Made from this bill's e-invoice (IRN). Part A comes from the IRN; Part B is the vehicle or transport document.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs sm:grid-cols-4">
          <div>
            <div className="text-slate-500">Bill date</div>
            <div className="font-medium tabular-nums text-slate-800">
              {String(sale.sale_date ?? "").slice(8, 10)}/{String(sale.sale_date ?? "").slice(5, 7)}/{String(sale.sale_date ?? "").slice(0, 4)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Value</div>
            <div className="font-medium tabular-nums text-slate-800">{inr(sale.net_amount)}</div>
          </div>
          <div className="col-span-2 min-w-0">
            <div className="text-slate-500">Buyer</div>
            <div className="truncate font-medium text-slate-800">{sale.customer_name || "—"}</div>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-4">
            <div className="text-slate-500">IRN</div>
            <div className="truncate font-mono text-[11px] text-slate-700">{sale.irn || "—"}</div>
          </div>
        </div>

        {missingSql ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Run the Phase 2 step 4 SQL first: it adds the e-way bill table.
          </div>
        ) : null}

        {active ? (
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
                    validity?.tone === "expired" ? "text-red-600" : validity?.tone === "soon" || validity?.tone === "partA" ? "text-amber-700" : "text-emerald-700",
                  )}
                >
                  {validity?.label}
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
                Lapsed. If the goods are still on the way, extend it on the e-way bill portal by {formatIstDateTime(extendUntil)}.
              </p>
            ) : alertKind === "soon" ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Lapses within 8 hours. If the goods won't reach in time, extend it on the e-way bill portal.
              </p>
            ) : alertKind === "partA" ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-md bg-sky-50 px-2 py-1.5 text-[11px] font-medium text-sky-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No vehicle yet. Add it on the e-way bill portal before the goods move.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {cancelUntil
                  ? `Vehicle change, extend and cancel (till ${formatIstDateTime(cancelUntil)}) are on the e-way bill portal for now.`
                  : "Vehicle change and extend are on the e-way bill portal for now."}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-emerald-200 bg-white text-xs text-emerald-800 hover:bg-emerald-50"
                onClick={() => void printer.print(active)}
                disabled={printer.printingId === active.id}
              >
                {printer.printingId === active.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                Print e-way bill
              </Button>
            </div>
          </div>
        ) : (
          <div className={cn("grid gap-4", (!hasIrn || missingSql) && "pointer-events-none opacity-60")}>
            {belowLimit ? (
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                This bill is {inr(sale.net_amount)}. An e-way bill is needed above {inr(EWB_VALUE_LIMIT)} (some states set their own limit within the state).
              </div>
            ) : null}

            <div>
              <span className={label}>Mode</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {MODES.map((m) => (
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
                <label htmlFor="ewb-doc" className={label}>{docLabel(form.mode)}</label>
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

            {isExport ? (
              <div className={cn("rounded-lg border border-indigo-200 bg-indigo-50/50 p-3", problem?.field === "port" && "border-red-300")}>
                <div className="mb-2 text-xs font-semibold text-indigo-800">Export bill: port the goods go to</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="ewb-port-addr1" className={label}>Port address</label>
                    <Input id="ewb-port-addr1" className={cn(field, "no-uppercase")} value={port.addr1} onChange={(e) => setP({ addr1: e.target.value })} placeholder="JNPT, Sheva" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="ewb-port-addr2" className={label}>Address line 2</label>
                    <Input id="ewb-port-addr2" className={cn(field, "no-uppercase")} value={port.addr2} onChange={(e) => setP({ addr2: e.target.value })} placeholder="Optional" />
                  </div>
                  <div>
                    <label htmlFor="ewb-port-place" className={label}>Place</label>
                    <Input id="ewb-port-place" className={cn(field, "no-uppercase")} value={port.place} onChange={(e) => setP({ place: e.target.value })} placeholder="Navi Mumbai" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ewb-port-pin" className={label}>PIN</label>
                      <Input
                        id="ewb-port-pin"
                        inputMode="numeric"
                        className={cn(field, "tabular-nums")}
                        value={port.pin}
                        onChange={(e) => setP({ pin: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
                        placeholder="400707"
                      />
                    </div>
                    <div>
                      <label htmlFor="ewb-port-state" className={label}>State</label>
                      <Select value={port.stateCode} onValueChange={(v) => setP({ stateCode: v })}>
                        <SelectTrigger id="ewb-port-state" className={field}>
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent className="z-[60] max-h-72">
                          {STATES.map(([code, name]) => (
                            <SelectItem key={code} value={code}>
                              {code} {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {problem ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {problem.error}
          </div>
        ) : null}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-slate-500"
            onClick={() => void run("sync")}
            disabled={!!busy || !hasIrn || missingSql}
            title="Read the e-way bill the IRP already holds for this IRN"
          >
            {busy === "sync" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {active ? "Refresh from IRP" : "Made on the portal? Fetch it"}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={!!busy}>
              Close
            </Button>
            {!active ? (
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => void run("generate")}
                disabled={!!busy || !hasIrn || missingSql || b2bLoading}
              >
                {busy === "generate" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
                Generate e-way bill
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
