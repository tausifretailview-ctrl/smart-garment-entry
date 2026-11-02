import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useEwayBillPrinter } from "@/hooks/useEwayBillPrinter";
import {
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
import { challanTypeLabel } from "@/utils/industrialMode";
import {
  ewbApiKeysSet,
  ewbFormFromB2b,
  ewbSellerPlace,
  ewbTransportInput,
  formatEwbNo,
  invokeEwayBill,
  istDateOf,
  type EwayBillRow,
  type EwbTransportForm,
} from "@/utils/ewayBill";
import {
  EWB_CHALLAN_SUB_SUPPLY,
  EWB_SUB_SUPPLY_DESC_MAX,
  EWB_VALUE_LIMIT,
  challanEwbSubSupply,
  ewbDistance,
  ewbTransportPart,
  ewbValidityDays,
  type EwbDirectField,
  type EwbProblemField,
} from "../../../supabase/functions/_shared/ewayBill";
import { indiaTodayIso } from "../../../supabase/functions/_shared/einvoiceNote";

/** The delivery challan an e-way bill is made for, as the challan list row has it. */
export type EwbChallanInfo = {
  id: string;
  challan_number: string;
  /** timestamptz as saved. */
  challan_date: string;
  challan_type?: string | null;
  net_amount: number | null;
  customer_name: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  challan: EwbChallanInfo | null;
  ewayBill: EwayBillRow | null;
  missingSql: boolean;
  onChanged: () => void;
};

const GSTIN_RE = /^[0-9]{2}[0-9A-Z]{13}$/;

function inr(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/**
 * E-way bill of one delivery challan (Phase 2 step 6b): made from the challan itself (document
 * type "Delivery challan") on the e-way bill API keys, with why the goods move; or see the one it has.
 */
export function ChallanEwayBillDialog({ open, onOpenChange, organizationId, challan, ewayBill, missingSql, onChanged }: Props) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [form, setForm] = useState<EwbTransportForm>(() => ewbFormFromB2b(null));
  const [shipTo, setShipTo] = useState<EwbShipToForm>({ pin: "", place: "", stateCode: "" });
  const [reason, setReason] = useState<{ code: string; desc: string }>(() => challanEwbSubSupply(null));
  const [problem, setProblem] = useState<{ field: EwbProblemField | EwbDirectField | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const printer = useEwayBillPrinter(organizationId);
  const queryClient = useQueryClient();
  const afterChange = () => {
    onChanged();
    void queryClient.invalidateQueries({ queryKey: ["eway-bill-alerts", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["eway-bill-register", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["challan-eway-bills", organizationId] });
  };

  // Buyer GSTIN and address are read here so the challan list query stays as it is.
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["challan-ewb-details", organizationId, challan?.id ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_challans")
        .select("challan_type, customer_address, shipping_address, customers:customer_id (gst_number, address)")
        .eq("id", challan!.id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as {
        challan_type?: string | null;
        customer_address?: string | null;
        shipping_address?: string | null;
        customers?: { gst_number?: string | null; address?: string | null } | null;
      };
      return {
        challanType: row.challan_type ?? null,
        buyerGstin: String(row.customers?.gst_number ?? "").trim().toUpperCase(),
        buyerAddress: row.shipping_address || row.customer_address || row.customers?.address || "",
      };
    },
    enabled: open && !!challan?.id,
    staleTime: 30_000,
  });

  const einvoiceSettings = (settings as { sale_settings?: { einvoice_settings?: Record<string, unknown> } } | null)?.sale_settings
    ?.einvoice_settings;
  const shopGstin = String(
    (einvoiceSettings?.test_mode !== false && einvoiceSettings?.seller_gstin) || (settings as { gst_number?: string | null } | null)?.gst_number || "",
  )
    .trim()
    .toUpperCase();

  // Start once per opening from the challan; a later refetch keeps what was typed.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSeededFor(null);
      return;
    }
    if (!challan?.id || detailsLoading || seededFor === challan.id) return;
    setForm(ewbFormFromB2b(null));
    const buyer = ewbSellerPlace(details?.buyerAddress ?? "", GSTIN_RE.test(details?.buyerGstin ?? "") ? details?.buyerGstin : null);
    setShipTo({ pin: buyer.pin, place: buyer.place, stateCode: buyer.stateCode || shopGstin.slice(0, 2) });
    setReason(challanEwbSubSupply(details?.challanType ?? challan.challan_type ?? null));
    setProblem(null);
    setSeededFor(challan.id);
  }, [open, challan?.id, challan?.challan_type, details, detailsLoading, seededFor, shopGstin]);

  const set = (patch: Partial<EwbTransportForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };
  const setS = (patch: Partial<EwbShipToForm>) => {
    setShipTo((p) => ({ ...p, ...patch }));
    setProblem(null);
  };
  const setR = (patch: Partial<{ code: string; desc: string }>) => {
    setReason((r) => ({ ...r, ...patch }));
    setProblem(null);
  };

  const days = useMemo(() => ewbValidityDays(ewbDistance(form.distanceKm), form.vehicleType), [form.distanceKm, form.vehicleType]);

  if (!challan) return printer.printNode;
  const active = ewayBill && ewayBill.status === "active" ? ewayBill : null;
  const challanDate = istDateOf(challan.challan_date);
  const belowLimit = Number(challan.net_amount ?? 0) <= EWB_VALUE_LIMIT;
  const keysSet = ewbApiKeysSet(einvoiceSettings);
  const canMake = !missingSql && keysSet;
  const testMode = active ? active.test_mode : einvoiceSettings ? einvoiceSettings.test_mode !== false : null;
  const ownUse = reason.code === "5";
  const buyerGstin = GSTIN_RE.test(details?.buyerGstin ?? "") ? details!.buyerGstin : "";
  const typeLabel = challanTypeLabel(details?.challanType ?? challan.challan_type ?? null);
  const reasonHint = EWB_CHALLAN_SUB_SUPPLY.find((s) => s.code === reason.code)?.hint ?? "";

  const run = async () => {
    if (busy) return;
    if (reason.code === "8" && (!reason.desc.trim() || reason.desc.trim().length > EWB_SUB_SUPPLY_DESC_MAX)) {
      setProblem({ field: "subSupply", error: `Say why the goods move in up to ${EWB_SUB_SUPPLY_DESC_MAX} letters, e.g. "Supply on approval".` });
      return;
    }
    const checked = ewbTransportPart(ewbTransportInput(form), { docDate: challanDate, today: indiaTodayIso() });
    if (checked.ok === false) {
      // The app's tsconfig is not strict, so the union is not narrowed here.
      const fail = checked as { field: EwbProblemField; error: string };
      setProblem({ field: fail.field, error: fail.error });
      return;
    }
    setBusy(true);
    try {
      const res = await invokeEwayBill({
        action: "challan",
        challanId: challan.id,
        organizationId,
        transport: ewbTransportInput(form),
        shipTo,
        subSupply: { code: reason.code, desc: reason.code === "8" ? reason.desc.trim() : null },
      });
      if (res.success) {
        toast({
          title: "E-way bill generated",
          description: `${challan.challan_number}: EWB ${formatEwbNo(res.ewbNo)}${
            res.partAOnly ? ". Add the vehicle on the portal before the goods move." : ""
          }`,
        });
        onOpenChange(false);
      } else {
        setProblem({
          field: (res.field as EwbProblemField | EwbDirectField | undefined) ?? null,
          error: res.error || "The e-way bill system did not accept it",
        });
      }
    } finally {
      setBusy(false);
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
                  E-way bill · {challan.challan_number}
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
                  Made from this delivery challan: goods by HSN at each product's GST rate, why they move, and the transport.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Challan date</div>
              <div className="font-medium tabular-nums text-slate-800">
                {challanDate ? `${challanDate.slice(8, 10)}/${challanDate.slice(5, 7)}/${challanDate.slice(0, 4)}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Value</div>
              <div className="font-medium tabular-nums text-slate-800">{inr(challan.net_amount)}</div>
            </div>
            <div className="col-span-2 min-w-0">
              <div className="text-slate-500">{ownUse ? "Goes to" : "Consignee"}</div>
              <div className="truncate font-medium text-slate-800">{challan.customer_name || "—"}</div>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-4">
              <div className="text-slate-500">Consignee GSTIN</div>
              <div className="truncate font-mono text-[11px] text-slate-700">
                {ownUse ? `${shopGstin || "Shop GSTIN"} (own use)` : buyerGstin || "Unregistered (URP)"}
                {typeLabel ? <span className="ml-2 font-sans text-slate-400">· {typeLabel}</span> : null}
              </div>
            </div>
          </div>

          {missingSql ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Run the Phase 2 step 6b SQL first: it links e-way bills to delivery challans.
            </div>
          ) : null}

          {active ? (
            <EwbActiveCard
              organizationId={organizationId}
              active={active}
              docDate={challanDate || null}
              onDone={afterChange}
              onPrint={() => void printer.print(active)}
              printing={printer.printingId === active.id}
            />
          ) : (
            <div className="grid gap-4">
              {!keysSet ? (
                <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  To make e-way bills for challans, add PeriOne's e-way bill keys and API email in Settings &gt; Sale &gt; E-Way Bill.
                </div>
              ) : null}
              <div className={cn("grid gap-4", !canMake && "pointer-events-none opacity-60")}>
                {belowLimit ? (
                  <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    This challan is {inr(challan.net_amount)}. An e-way bill is needed above {inr(EWB_VALUE_LIMIT)}; goods sent for job
                    work to another state need one at any value.
                  </div>
                ) : null}

                <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
                  <div className="mb-2 text-xs font-semibold text-teal-900">Why the goods move</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="ewb-sub-supply" className={ewbLabel}>Reason</label>
                      <Select value={reason.code} onValueChange={(v) => setR({ code: v })}>
                        <SelectTrigger id="ewb-sub-supply" className={cn(ewbField, bad("subSupply"))}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[60]">
                          {EWB_CHALLAN_SUB_SUPPLY.map((s) => (
                            <SelectItem key={s.code} value={s.code}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {reason.code === "8" ? (
                      <div>
                        <label htmlFor="ewb-sub-supply-desc" className={ewbLabel}>In a few words</label>
                        <Input
                          id="ewb-sub-supply-desc"
                          className={cn(ewbField, "no-uppercase", bad("subSupply"))}
                          value={reason.desc}
                          maxLength={EWB_SUB_SUPPLY_DESC_MAX}
                          onChange={(e) => setR({ desc: e.target.value })}
                          placeholder="Supply on approval"
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {reasonHint}
                    {ownUse ? " The e-way bill shows your shop's GSTIN on both sides." : ""}
                  </p>
                </div>

                <EwbTransportFields form={form} set={set} bad={bad} days={days} />

                <EwbShipToFields
                  shipTo={shipTo}
                  setS={setS}
                  bad={bad}
                  hint={
                    ownUse
                      ? "Your branch or godown's address. It must be in your shop's state."
                      : "From the challan's shipping or customer address. GST is IGST when this state differs from your shop's state."
                  }
                />
              </div>
            </div>
          )}

          {problem ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {problem.error}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Close
            </Button>
            {!active ? (
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => void run()}
                disabled={busy || !canMake || detailsLoading}
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
                Generate e-way bill
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
