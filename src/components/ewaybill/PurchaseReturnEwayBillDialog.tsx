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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  EWB_PURCHASE_RETURN_DESC,
  EWB_SUB_SUPPLY_DESC_MAX,
  EWB_VALUE_LIMIT,
  ewbDistance,
  ewbTransportPart,
  ewbValidityDays,
  type EwbDirectField,
  type EwbProblemField,
} from "../../../supabase/functions/_shared/ewayBill";
import { indiaTodayIso } from "../../../supabase/functions/_shared/einvoiceNote";

/** The purchase return an e-way bill is made for, as the purchase return list row has it. */
export type EwbPurchaseReturnInfo = {
  id: string;
  return_number: string | null;
  /** yyyy-mm-dd as saved. */
  return_date: string;
  net_amount: number | null;
  supplier_name: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  purchaseReturn: EwbPurchaseReturnInfo | null;
  ewayBill: EwayBillRow | null;
  missingSql: boolean;
  onChanged: () => void;
};

const GSTIN_RE = /^[0-9]{2}[0-9A-Z]{13}$/;

function inr(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/**
 * E-way bill of one purchase return (Phase 2 step 6c): the goods go back to the supplier, so the
 * supplier is the consignee and the document is a delivery challan with reason "Others: Purchase
 * return"; or see the e-way bill it has.
 */
export function PurchaseReturnEwayBillDialog({ open, onOpenChange, organizationId, purchaseReturn, ewayBill, missingSql, onChanged }: Props) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [form, setForm] = useState<EwbTransportForm>(() => ewbFormFromB2b(null));
  const [shipTo, setShipTo] = useState<EwbShipToForm>({ pin: "", place: "", stateCode: "" });
  const [reason, setReason] = useState(EWB_PURCHASE_RETURN_DESC);
  const [problem, setProblem] = useState<{ field: EwbProblemField | EwbDirectField | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const printer = useEwayBillPrinter(organizationId);
  const queryClient = useQueryClient();
  const afterChange = () => {
    onChanged();
    void queryClient.invalidateQueries({ queryKey: ["eway-bill-alerts", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["eway-bill-register", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-return-eway-bills", organizationId] });
  };

  // The supplier's GSTIN and address are read here so the purchase return list query stays as it is.
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["purchase-return-ewb-details", organizationId, purchaseReturn?.id ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("supplier_name, suppliers:supplier_id (gst_number, address)")
        .eq("id", purchaseReturn!.id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as {
        supplier_name?: string | null;
        suppliers?: { gst_number?: string | null; address?: string | null } | null;
      };
      return {
        supplierGstin: String(row.suppliers?.gst_number ?? "").trim().toUpperCase(),
        supplierAddress: String(row.suppliers?.address ?? ""),
      };
    },
    enabled: open && !!purchaseReturn?.id,
    staleTime: 30_000,
  });

  const einvoiceSettings = (settings as { sale_settings?: { einvoice_settings?: Record<string, unknown> } } | null)?.sale_settings
    ?.einvoice_settings;
  const shopGstin = String(
    (einvoiceSettings?.test_mode !== false && einvoiceSettings?.seller_gstin) || (settings as { gst_number?: string | null } | null)?.gst_number || "",
  )
    .trim()
    .toUpperCase();

  // Start once per opening from the return; a later refetch keeps what was typed.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSeededFor(null);
      return;
    }
    if (!purchaseReturn?.id || detailsLoading || seededFor === purchaseReturn.id) return;
    setForm(ewbFormFromB2b(null));
    const supplier = ewbSellerPlace(
      details?.supplierAddress ?? "",
      GSTIN_RE.test(details?.supplierGstin ?? "") ? details?.supplierGstin : null,
    );
    setShipTo({ pin: supplier.pin, place: supplier.place, stateCode: supplier.stateCode || shopGstin.slice(0, 2) });
    setReason(EWB_PURCHASE_RETURN_DESC);
    setProblem(null);
    setSeededFor(purchaseReturn.id);
  }, [open, purchaseReturn?.id, details, detailsLoading, seededFor, shopGstin]);

  const set = (patch: Partial<EwbTransportForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };
  const setS = (patch: Partial<EwbShipToForm>) => {
    setShipTo((p) => ({ ...p, ...patch }));
    setProblem(null);
  };

  const days = useMemo(() => ewbValidityDays(ewbDistance(form.distanceKm), form.vehicleType), [form.distanceKm, form.vehicleType]);

  if (!purchaseReturn) return printer.printNode;
  const active = ewayBill && ewayBill.status === "active" ? ewayBill : null;
  const returnDate = istDateOf(purchaseReturn.return_date);
  const returnNo = purchaseReturn.return_number || "Purchase return";
  const belowLimit = Number(purchaseReturn.net_amount ?? 0) <= EWB_VALUE_LIMIT;
  const keysSet = ewbApiKeysSet(einvoiceSettings);
  const canMake = !missingSql && keysSet;
  const testMode = active ? active.test_mode : einvoiceSettings ? einvoiceSettings.test_mode !== false : null;
  const supplierGstin = GSTIN_RE.test(details?.supplierGstin ?? "") ? details!.supplierGstin : "";

  const run = async () => {
    if (busy) return;
    const desc = reason.replace(/\s+/g, " ").trim();
    if (!desc || desc.length > EWB_SUB_SUPPLY_DESC_MAX) {
      setProblem({ field: "subSupply", error: `Say why the goods go back in up to ${EWB_SUB_SUPPLY_DESC_MAX} letters, e.g. "${EWB_PURCHASE_RETURN_DESC}".` });
      return;
    }
    const checked = ewbTransportPart(ewbTransportInput(form), { docDate: returnDate, today: indiaTodayIso() });
    if (checked.ok === false) {
      // The app's tsconfig is not strict, so the union is not narrowed here.
      const fail = checked as { field: EwbProblemField; error: string };
      setProblem({ field: fail.field, error: fail.error });
      return;
    }
    setBusy(true);
    try {
      const res = await invokeEwayBill({
        action: "purchase_return",
        purchaseReturnId: purchaseReturn.id,
        organizationId,
        transport: ewbTransportInput(form),
        shipTo,
        subSupply: { code: "8", desc },
      });
      if (res.success) {
        toast({
          title: "E-way bill generated",
          description: `${returnNo}: EWB ${formatEwbNo(res.ewbNo)}${res.partAOnly ? ". Add the vehicle on the portal before the goods move." : ""}`,
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
                  E-way bill · {returnNo}
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
                  Goods going back to the supplier: made from this purchase return, by HSN at the GST saved on it, with the transport.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Return date</div>
              <div className="font-medium tabular-nums text-slate-800">
                {returnDate ? `${returnDate.slice(8, 10)}/${returnDate.slice(5, 7)}/${returnDate.slice(0, 4)}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Value</div>
              <div className="font-medium tabular-nums text-slate-800">{inr(purchaseReturn.net_amount)}</div>
            </div>
            <div className="col-span-2 min-w-0">
              <div className="text-slate-500">Consignee (supplier)</div>
              <div className="truncate font-medium text-slate-800">{purchaseReturn.supplier_name || "—"}</div>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-4">
              <div className="text-slate-500">Supplier GSTIN</div>
              <div className="truncate font-mono text-[11px] text-slate-700">
                {supplierGstin || "Unregistered (URP)"}
                <span className="ml-2 font-sans text-slate-400">· Delivery challan, Others</span>
              </div>
            </div>
          </div>

          {missingSql ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Run the Phase 2 step 6b SQL first: it links e-way bills to delivery challans and purchase returns.
            </div>
          ) : null}

          {active ? (
            <EwbActiveCard
              organizationId={organizationId}
              active={active}
              docDate={returnDate || null}
              onDone={afterChange}
              onPrint={() => void printer.print(active)}
              printing={printer.printingId === active.id}
            />
          ) : (
            <div className="grid gap-4">
              {!keysSet ? (
                <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  To make e-way bills for purchase returns, add PeriOne's e-way bill keys and API email in Settings &gt; Sale &gt; E-Way Bill.
                </div>
              ) : null}
              <div className={cn("grid gap-4", !canMake && "pointer-events-none opacity-60")}>
                {belowLimit ? (
                  <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    This return is {inr(purchaseReturn.net_amount)}. An e-way bill is needed when goods above {inr(EWB_VALUE_LIMIT)} move by
                    vehicle.
                  </div>
                ) : null}

                <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
                  <div className="mb-2 text-xs font-semibold text-teal-900">Why the goods move</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className={ewbLabel}>Reason</div>
                      <div className={cn(ewbField, "flex items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700")}>
                        Others
                      </div>
                    </div>
                    <div>
                      <label htmlFor="ewb-pr-desc" className={ewbLabel}>In a few words</label>
                      <Input
                        id="ewb-pr-desc"
                        className={cn(ewbField, "no-uppercase", bad("subSupply"))}
                        value={reason}
                        maxLength={EWB_SUB_SUPPLY_DESC_MAX}
                        onChange={(e) => {
                          setReason(e.target.value);
                          setProblem(null);
                        }}
                        placeholder={EWB_PURCHASE_RETURN_DESC}
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    The portal has no separate reason for goods sent back, so it goes as "Others" with these words.
                  </p>
                </div>

                <EwbTransportFields form={form} set={set} bad={bad} days={days} />

                <EwbShipToFields
                  shipTo={shipTo}
                  setS={setS}
                  bad={bad}
                  hint="From the supplier's address. GST is IGST when this state differs from your shop's state."
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
