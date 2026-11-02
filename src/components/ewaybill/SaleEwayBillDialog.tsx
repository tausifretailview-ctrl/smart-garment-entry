import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2, RefreshCw, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useEwayBillPrinter } from "@/hooks/useEwayBillPrinter";
import {
  EWB_STATES,
  EwbActiveCard,
  EwbShipToFields,
  EwbTransportFields,
  ewbField,
  ewbLabel,
  type EwbShipToForm,
} from "@/components/ewaybill/EwbFormParts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  EMPTY_PORT_FORM,
  ewbFormFromB2b,
  ewbPortInput,
  ewbApiKeysSet,
  ewbSellerPlace,
  ewbTransportInput,
  formatEwbNo,
  invokeEwayBill,
  type EwayBillRow,
  type EwbPortForm,
  type EwbTransportForm,
} from "@/utils/ewayBill";
import {
  EWB_VALUE_LIMIT,
  buildEwbByIrnPayload,
  ewbDistance,
  ewbTransportPart,
  ewbValidityDays,
  type EwbDirectField,
  type EwbProblemField,
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

const GSTIN_RE = /^[0-9]{2}[0-9A-Z]{13}$/;
type ShipToForm = EwbShipToForm;
const field = ewbField;
const label = ewbLabel;
const STATES = EWB_STATES;

function inr(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/**
 * E-way bill of one sale bill: from its e-invoice (IRN), or a direct e-way bill when it has none
 * (step 6a); or see the one it has.
 */
export function SaleEwayBillDialog({ open, onOpenChange, organizationId, sale, ewayBill, missingSql, onChanged }: Props) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [form, setForm] = useState<EwbTransportForm>(() => ewbFormFromB2b(null));
  const [port, setPort] = useState<EwbPortForm>(EMPTY_PORT_FORM);
  const [shipTo, setShipTo] = useState<ShipToForm>({ pin: "", place: "", stateCode: "" });
  const [problem, setProblem] = useState<{ field: EwbProblemField | EwbDirectField | null; error: string } | null>(null);
  const [busy, setBusy] = useState<"generate" | "sync" | null>(null);
  const printer = useEwayBillPrinter(organizationId);
  const queryClient = useQueryClient();
  const afterChange = () => {
    onChanged();
    // The register and the lapse alerts read the same table.
    void queryClient.invalidateQueries({ queryKey: ["eway-bill-alerts", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["eway-bill-register", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["sale-eway-bills", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["eway-bills-for-sales", organizationId] });
  };

  // The bill's B2B details (transport, export) and buyer are read here so the list query stays as it is.
  const { data: details, isLoading: b2bLoading } = useQuery({
    queryKey: ["sale-ewb-details", organizationId, sale?.id ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("b2b_details, customer_address, customers:customer_id (gst_number, address)")
        .eq("id", sale!.id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as {
        b2b_details?: unknown;
        customer_address?: string | null;
        customers?: { gst_number?: string | null; address?: string | null } | null;
      };
      return {
        b2b: row.b2b_details ?? null,
        buyerGstin: String(row.customers?.gst_number ?? "").trim().toUpperCase(),
        buyerAddress: row.customer_address || row.customers?.address || "",
      };
    },
    enabled: open && !!sale?.id,
    staleTime: 30_000,
  });
  const b2b = details?.b2b ?? null;
  const einvoiceSettings = (settings as { sale_settings?: { einvoice_settings?: Record<string, unknown> } } | null)?.sale_settings
    ?.einvoice_settings;
  const shopGstin = String(
    (einvoiceSettings?.test_mode !== false && einvoiceSettings?.seller_gstin) || (settings as { gst_number?: string | null } | null)?.gst_number || "",
  )
    .trim()
    .toUpperCase();

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
    const buyer = ewbSellerPlace(details?.buyerAddress ?? "", GSTIN_RE.test(details?.buyerGstin ?? "") ? details?.buyerGstin : null);
    setShipTo({ pin: buyer.pin, place: buyer.place, stateCode: buyer.stateCode || shopGstin.slice(0, 2) });
    setProblem(null);
    setSeededFor(sale.id);
  }, [open, sale?.id, b2b, details, b2bLoading, seededFor, shopGstin]);

  const isExport = isExportSupplyType(irpSupplyTypeOf(b2b ?? null));
  const set = (patch: Partial<EwbTransportForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };
  const setP = (patch: Partial<EwbPortForm>) => {
    setPort((p) => ({ ...p, ...patch }));
    setProblem(null);
  };
  const setS = (patch: Partial<ShipToForm>) => {
    setShipTo((p) => ({ ...p, ...patch }));
    setProblem(null);
  };

  const days = useMemo(() => ewbValidityDays(ewbDistance(form.distanceKm), form.vehicleType), [form.distanceKm, form.vehicleType]);

  if (!sale) return printer.printNode;
  const active = ewayBill && ewayBill.status === "active" ? ewayBill : null;
  const belowLimit = Number(sale.net_amount ?? 0) <= EWB_VALUE_LIMIT;
  const hasIrn = !!sale.irn && sale.einvoice_status === "generated";
  // No IRN: a direct e-way bill on the e-way bill API keys. Export bills and, in an e-invoice shop,
  // bills to a registered buyer need the IRN first.
  const direct = !hasIrn;
  const einvoiceOn = einvoiceSettings?.enabled === true;
  const needsIrn = direct && (isExport || (einvoiceOn && GSTIN_RE.test(details?.buyerGstin ?? "")));
  const keysSet = ewbApiKeysSet(einvoiceSettings);
  const canMake = !missingSql && (hasIrn || (!needsIrn && keysSet));
  const testMode = active ? active.test_mode : hasIrn ? sale.einvoice_test_mode ?? null : einvoiceSettings ? einvoiceSettings.test_mode !== false : null;

  const run = async (action: "generate" | "sync") => {
    if (busy) return;
    if (action === "generate" && direct) {
      const checked = ewbTransportPart(ewbTransportInput(form), { docDate: String(sale.sale_date ?? "").slice(0, 10), today: indiaTodayIso() });
      if (checked.ok === false) {
        const fail = checked as { field: EwbProblemField; error: string };
        setProblem({ field: fail.field, error: fail.error });
        return;
      }
    } else if (action === "generate") {
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
      const res = await invokeEwayBill(
        action === "generate" && direct
          ? { action: "direct", saleId: sale.id, organizationId, transport: ewbTransportInput(form), shipTo }
          : {
              action,
              saleId: sale.id,
              organizationId,
              ...(action === "generate" ? { transport: ewbTransportInput(form), exportPort: isExport ? ewbPortInput(port) : undefined } : {}),
            },
      );
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
        // generate / sync / direct only report this form's fields.
        setProblem({
          field: (res.field as EwbProblemField | EwbDirectField | undefined) ?? null,
          error: res.error || (direct ? "The e-way bill system did not accept it" : "The IRP did not accept it"),
        });
      }
    } finally {
      setBusy(null);
      afterChange();
    }
  };

  const bad = (f: EwbProblemField | EwbDirectField) => (problem?.field === f ? "border-red-400 ring-1 ring-red-200" : "");

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
                {direct
                  ? "This bill has no e-invoice, so the e-way bill is made from the bill itself: goods by HSN, buyer and transport."
                  : "Made from this bill's e-invoice (IRN). Part A comes from the IRN; Part B is the vehicle or transport document."}
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
            <div className="text-slate-500">{direct ? "Buyer GSTIN" : "IRN"}</div>
            <div className="truncate font-mono text-[11px] text-slate-700">
              {direct ? (GSTIN_RE.test(details?.buyerGstin ?? "") ? details?.buyerGstin : "Unregistered (URP)") : sale.irn || "—"}
            </div>
          </div>
        </div>

        {missingSql ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Run the Phase 2 step 4 SQL first: it adds the e-way bill table.
          </div>
        ) : null}

        {active ? (
          <EwbActiveCard
            organizationId={organizationId}
            active={active}
            docDate={String(sale.sale_date ?? "").slice(0, 10) || null}
            onDone={afterChange}
            onPrint={() => void printer.print(active)}
            printing={printer.printingId === active.id}
          />
        ) : (
          <div className="grid gap-4">
            {direct && needsIrn ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {isExport
                  ? "Export bill: generate its e-invoice (IRN) first. The e-way bill is made from the IRN."
                  : "This buyer has a GSTIN and your shop makes e-invoices: generate the e-invoice (IRN) first. The e-way bill is made from it."}
              </div>
            ) : direct && !keysSet ? (
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                To make e-way bills for bills without an e-invoice, add PeriOne's e-way bill keys and API email in Settings &gt; Sale &gt; E-Way Bill.
              </div>
            ) : null}
          <div className={cn("grid gap-4", !canMake && "pointer-events-none opacity-60")}>
            {belowLimit ? (
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                This bill is {inr(sale.net_amount)}. An e-way bill is needed above {inr(EWB_VALUE_LIMIT)} (some states set their own limit within the state).
              </div>
            ) : null}

            <EwbTransportFields form={form} set={set} bad={bad} days={days} />

            {direct ? (
              <EwbShipToFields
                shipTo={shipTo}
                setS={setS}
                bad={bad}
                hint="From the buyer's address. GST is IGST when this state differs from your shop's state."
              />
            ) : null}

            {isExport && !direct ? (
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
            onClick={() => void run("sync")}
            disabled={!!busy || !hasIrn || missingSql}
            className={cn("text-xs text-slate-500", !hasIrn && "invisible")}
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
                disabled={!!busy || !canMake || b2bLoading}
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
