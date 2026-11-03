import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Info, Loader2, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useEwayBillPrinter } from "@/hooks/useEwayBillPrinter";
import { EwbActiveCard, EwbTransportFields } from "@/components/ewaybill/EwbFormParts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ymdToDdMmYyyy } from "@/lib/dateDisplay";
import { fetchGodowns } from "@/utils/godowns";
import { fetchGodownMove, transportOf } from "@/utils/godownTransfer";
import {
  ewbApiKeysSet,
  ewbFormFromB2b,
  ewbTransportInput,
  formatEwbNo,
  invokeEwayBill,
  type EwayBillRow,
  type EwbTransportForm,
} from "@/utils/ewayBill";
import {
  EWB_VALUE_LIMIT,
  ewbDistance,
  ewbTransportPart,
  ewbValidityDays,
  godownTransferEwbPlaces,
  type EwbDirectField,
  type EwbProblemField,
} from "../../../supabase/functions/_shared/ewayBill";
import { indiaTodayIso } from "../../../supabase/functions/_shared/einvoiceNote";

/** The godown transfer an e-way bill is made for, as the transfer list or the register has it. */
export type EwbGodownMoveInfo = {
  id: string;
  move_no: string | null;
  /** yyyy-mm-dd as saved. */
  move_date: string;
  total_value: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  move: EwbGodownMoveInfo | null;
  ewayBill: EwayBillRow | null;
  missingSql: boolean;
  onChanged: () => void;
};

function inr(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/**
 * E-way bill of one godown transfer (Industrial mode, Phase 3 step 3b): goods moving between the
 * shop's own godowns on one GSTIN go as a delivery challan "For own use", from one godown's
 * address to the other's; or see the e-way bill it has.
 */
export function GodownTransferEwayBillDialog({ open, onOpenChange, organizationId, move, ewayBill, missingSql, onChanged }: Props) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [form, setForm] = useState<EwbTransportForm>(() => ewbFormFromB2b(null));
  const [problem, setProblem] = useState<{ field: EwbProblemField | EwbDirectField | "seller" | "toPin" | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const printer = useEwayBillPrinter(organizationId);
  const queryClient = useQueryClient();
  const afterChange = () => {
    onChanged();
    for (const key of ["eway-bill-alerts", "eway-bill-register", "godown-transfer-eway-bills"]) {
      void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
    }
  };

  // The transfer's godowns and transport are read here, so the lists stay as light as they are.
  const full = useQuery({
    queryKey: ["godown-move", move?.id ?? ""],
    queryFn: () => fetchGodownMove(move!.id),
    enabled: open && !!move?.id,
    staleTime: 30_000,
  });
  const places = useQuery({
    queryKey: ["godowns", organizationId],
    queryFn: () => fetchGodowns(organizationId),
    enabled: open,
    staleTime: 60_000,
  });
  const from = places.data?.godowns.find((g) => g.id === full.data?.from_godown_id) ?? null;
  const to = places.data?.godowns.find((g) => g.id === full.data?.to_godown_id) ?? null;
  const shopAddress = String((settings as { address?: string | null } | null)?.address ?? "");
  const where = from && to ? godownTransferEwbPlaces(from, to, shopAddress) : null;
  const placeProblem = where && where.ok === false ? (where as { field: "seller" | "toPin"; error: string }) : null;
  const addresses = where && where.ok ? (where as { from: string; to: string }) : null;
  const loading = full.isLoading || places.isLoading;

  // Start once per opening from the transfer's own transport; a later refetch keeps what was typed.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSeededFor(null);
      return;
    }
    if (!move?.id || !full.data || seededFor === move.id) return;
    const t = transportOf(full.data.transport);
    setForm({
      ...ewbFormFromB2b(null),
      vehicleNo: t.vehicle_no ?? "",
      transporterName: t.transporter_name ?? "",
      transDocNo: t.lr_no ?? "",
      transDocDate: t.lr_no ? String(full.data.move_date).slice(0, 10) : "",
    });
    setProblem(null);
    setSeededFor(move.id);
  }, [open, move?.id, full.data, seededFor]);

  const set = (patch: Partial<EwbTransportForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };

  const days = useMemo(() => ewbValidityDays(ewbDistance(form.distanceKm), form.vehicleType), [form.distanceKm, form.vehicleType]);

  if (!move) return printer.printNode;
  const active = ewayBill && ewayBill.status === "active" ? ewayBill : null;
  const moveDate = String(move.move_date ?? "").slice(0, 10);
  const moveNo = move.move_no || "Godown transfer";
  const belowLimit = Number(move.total_value ?? 0) <= EWB_VALUE_LIMIT;
  const einvoiceSettings = (settings as { sale_settings?: { einvoice_settings?: Record<string, unknown> } } | null)?.sale_settings
    ?.einvoice_settings;
  const keysSet = ewbApiKeysSet(einvoiceSettings);
  const cancelled = full.data?.status === "cancelled";
  const canMake = !missingSql && keysSet && !cancelled;
  const testMode = active ? active.test_mode : einvoiceSettings ? einvoiceSettings.test_mode !== false : null;

  const run = async () => {
    if (busy) return;
    if (placeProblem) {
      setProblem(placeProblem);
      return;
    }
    const checked = ewbTransportPart(ewbTransportInput(form), { docDate: moveDate, today: indiaTodayIso() });
    if (checked.ok === false) {
      // The app's tsconfig is not strict, so the union is not narrowed here.
      const fail = checked as { field: EwbProblemField; error: string };
      setProblem({ field: fail.field, error: fail.error });
      return;
    }
    setBusy(true);
    try {
      const res = await invokeEwayBill({
        action: "godown_transfer",
        godownMoveId: move.id,
        organizationId,
        transport: ewbTransportInput(form),
      });
      if (res.success) {
        toast({
          title: "E-way bill generated",
          description: `${moveNo}: EWB ${formatEwbNo(res.ewbNo)}${res.partAOnly ? ". Add the vehicle on the portal before the goods move." : ""}`,
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
                  E-way bill · {moveNo}
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
                  Goods moving between your own godowns: a delivery challan "For own use" on your GSTIN, with no GST, at the value on the transfer.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Transfer date</div>
              <div className="font-medium tabular-nums text-slate-800">{ymdToDdMmYyyy(moveDate) || "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">Value at cost</div>
              <div className="font-medium tabular-nums text-slate-800">{inr(move.total_value)}</div>
            </div>
            <div className="col-span-2 min-w-0">
              <div className="text-slate-500">From → To</div>
              <div className="flex items-center gap-1 truncate font-medium text-slate-800">
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                ) : (
                  <>
                    <span className="truncate">{from?.name ?? "—"}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                    <span className="truncate">{to?.name ?? "—"}</span>
                  </>
                )}
              </div>
            </div>
            {addresses ? (
              <>
                <div className="col-span-2 min-w-0">
                  <div className="text-slate-500">Dispatch from</div>
                  <div className="truncate text-[11px] text-slate-700" title={addresses.from}>
                    {addresses.from}
                  </div>
                </div>
                <div className="col-span-2 min-w-0">
                  <div className="text-slate-500">Ship to</div>
                  <div className="truncate text-[11px] text-slate-700" title={addresses.to}>
                    {addresses.to}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {missingSql ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Run the Phase 3 step 3b SQL first: it links e-way bills to godown transfers.
            </div>
          ) : null}

          {active ? (
            <EwbActiveCard
              organizationId={organizationId}
              active={active}
              docDate={moveDate || null}
              onDone={afterChange}
              onPrint={() => void printer.print(active)}
              printing={printer.printingId === active.id}
            />
          ) : cancelled ? (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              This transfer is cancelled, so it needs no e-way bill.
            </div>
          ) : (
            <div className="grid gap-4">
              {!keysSet ? (
                <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  To make e-way bills for godown transfers, add PeriOne's e-way bill keys and API email in Settings &gt; Sale &gt; E-Way Bill.
                </div>
              ) : null}
              {placeProblem ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {placeProblem.error}
                </div>
              ) : null}
              <div className={cn("grid gap-4", !canMake && "pointer-events-none opacity-60")}>
                {belowLimit ? (
                  <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    This transfer is {inr(move.total_value)}. An e-way bill is needed when goods above {inr(EWB_VALUE_LIMIT)} move by vehicle.
                  </div>
                ) : null}
                <EwbTransportFields form={form} set={set} bad={bad} days={days} />
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
            {!active && !cancelled ? (
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => void run()}
                disabled={busy || !canMake || loading || !!placeProblem}
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
