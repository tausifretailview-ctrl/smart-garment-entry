import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useManufacturerERP } from "@/hooks/useManufacturerERP";
import { ArrowLeft, PackageCheck, Scissors, Send, Trash2, Undo2 } from "lucide-react";
import {
  computeDesignStandardCost,
  computeLotCost,
  computeLotFlow,
  jobCardRemaining,
  MFG_LOT_STATUS_LABEL,
  type MfgEndBitsDefault,
  type MfgLotStatus,
  type MfgOverIssueAction,
  type MfgWorkType,
} from "@/utils/manufacturing";
import {
  db,
  errMsg,
  fabricStockKey,
  inr,
  isMtr,
  lotDetailKey,
  lotsKey,
  mtr,
  openJobCardsKey,
  pcs,
  useFabricStock,
  useMfgDesigns,
  useMfgLotDetail,
  useMfgProducts,
  useMfgStages,
  useMfgWorkers,
  type MfgDesign,
  type MfgJobCard,
  type MfgLot,
  type MfgLotRoll,
  type MfgProduct,
  type MfgStage,
  type MfgWorker,
} from "./mfgData";

const STATUS_VARIANT: Record<MfgLotStatus, "default" | "secondary" | "outline" | "destructive"> = {
  open: "outline",
  cut: "default",
  finished: "secondary",
  cancelled: "destructive",
};

export function LotStatusBadge({ status }: { status: MfgLotStatus }) {
  return <Badge variant={STATUS_VARIANT[status] || "outline"}>{MFG_LOT_STATUS_LABEL[status] || status}</Badge>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const num = (v: string | number | null | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const sizeLabel = (v: { size: string | null; color: string | null } | null | undefined) =>
  [v?.color, v?.size].filter(Boolean).join(" / ") || "—";
const rollLabel = (r: MfgLotRoll) =>
  [r.variant?.product?.product_name, r.variant?.color, r.variant?.size ? `${r.variant.size} m roll` : null]
    .filter(Boolean)
    .join(" · ");

export function workersFor(workers: MfgWorker[], workType: MfgWorkType | undefined) {
  if (workType === "in_house") return workers.filter((w) => w.type === "employee");
  if (workType === "job_work") return workers.filter((w) => w.type === "supplier");
  return workers;
}

export function WorkerPicker({
  workers,
  workType,
  value,
  onChange,
}: {
  workers: MfgWorker[];
  workType?: MfgWorkType;
  value: string;
  onChange: (key: string) => void;
}) {
  const options = useMemo(
    () =>
      workersFor(workers, workType).map((w) => ({
        value: w.key,
        label: `${w.name} (${w.type === "employee" ? "Staff" : "Job worker"})`,
      })),
    [workers, workType],
  );
  return (
    <SearchableSelect value={value} onValueChange={onChange} options={options} allValue="" allLabel="Pick worker" triggerClassName="h-10" />
  );
}

/** Fabric metres one piece needs on the design card (wastage allowance included). */
function designFabricPerPiece(design: MfgDesign | undefined, productById: Map<string, MfgProduct>) {
  if (!design) return 0;
  return design.materials
    .filter((m) => isMtr(productById.get(m.material_product_id)))
    .reduce((s, m) => s + num(m.qty_per_piece) * (1 + num(m.wastage_percent) / 100), 0);
}

function designTrimsPerPiece(design: MfgDesign | undefined, productById: Map<string, MfgProduct>) {
  if (!design) return 0;
  return computeDesignStandardCost(
    design.materials
      .filter((m) => !isMtr(productById.get(m.material_product_id)))
      .map((m) => ({
        material_type: "trim" as const,
        qty_per_piece: num(m.qty_per_piece),
        wastage_percent: num(m.wastage_percent),
        unit_price: num(productById.get(m.material_product_id)?.default_pur_price),
      })),
    [],
    0,
  ).trims;
}

function stageRate(design: MfgDesign | undefined, stage: MfgStage | undefined) {
  if (!stage) return 0;
  const r = design?.stage_rates.find((x) => x.stage_id === stage.id);
  return r ? num(r.rate) : num(stage.default_rate);
}

// ───────────────────────────── Cutting ─────────────────────────────

function CuttingSection({
  orgId,
  lot,
  rolls,
  design,
  productById,
  cuttingStage,
  workers,
  allowedWastage,
  overIssueAction,
  refresh,
}: {
  orgId: string;
  lot: MfgLot;
  rolls: MfgLotRoll[];
  design: MfgDesign | undefined;
  productById: Map<string, MfgProduct>;
  cuttingStage: MfgStage | undefined;
  workers: MfgWorker[];
  allowedWastage: number;
  overIssueAction: MfgOverIssueAction;
  refresh: () => void;
}) {
  const { toast } = useToast();
  const isOpen = lot.status === "open";
  const activeRolls = rolls.filter((r) => !r.cancelled_at);
  const { data: fabric = [] } = useFabricStock(isOpen ? orgId : undefined);

  const [pick, setPick] = useState("");
  const [meters, setMeters] = useState("");
  const [scan, setScan] = useState("");
  // Only typed values are kept; untouched boxes show the plan / design-card rate, so a refetch
  // after issuing a roll never wipes what the user typed.
  const [cut, setCut] = useState<Record<string, string>>({});
  const [leftover, setLeftover] = useState<Record<string, string>>({});
  const [endBits, setEndBits] = useState<MfgEndBitsDefault>(lot.end_bits_action);
  const [workerKey, setWorkerKey] = useState("");
  const [rateInput, setRateInput] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const defaultRate = stageRate(design, cuttingStage);
  const rate = rateInput ?? (defaultRate ? String(defaultRate) : "");
  const cutValue = (s: MfgLot["sizes"][number]) => cut[s.id] ?? String(num(s.planned_qty));

  const plannedTotal = lot.sizes.reduce((s, x) => s + num(x.planned_qty), 0);
  const perPiece = designFabricPerPiece(design, productById);
  const issuedTotal = activeRolls.reduce((s, r) => s + num(r.issued_meters), 0);

  // Fabric issued above the design card + allowed % is flagged (or blocked, per Settings).
  const standardNeed = perPiece * plannedTotal;
  const issueLimit = standardNeed * (1 + Math.max(allowedWastage, 0) / 100);
  const afterIssue = issuedTotal + Math.max(num(meters), 0);
  const overIssue = isOpen && standardNeed > 0 && num(meters) > 0 && afterIssue > issueLimit + 0.0005;
  const overPctAfter = standardNeed > 0 ? ((afterIssue - standardNeed) / standardNeed) * 100 : 0;
  const blockOverIssue = overIssue && overIssueAction === "block";

  const fabricOptions = useMemo(
    () =>
      fabric
        .filter((f) => num(f.meters_left) > 0)
        .map((f) => ({
          value: f.variant_id,
          label: `${f.product_name}${f.color ? ` · ${f.color}` : ""}${f.barcode ? ` · ${f.barcode}` : ""} — ${mtr(f.meters_left)} left`,
        })),
    [fabric],
  );

  const choose = (variantId: string) => {
    setPick(variantId);
    const row = fabric.find((f) => f.variant_id === variantId);
    if (row) setMeters(String(Math.round(num(row.meters_left) * 100) / 100));
  };

  const onScan = () => {
    const code = scan.trim();
    if (!code) return;
    const row = fabric.find((f) => (f.barcode || "").toLowerCase() === code.toLowerCase());
    if (!row) {
      toast({ title: "Roll not found", description: `No MTR fabric with barcode ${code} in stock.`, variant: "destructive" });
      return;
    }
    choose(row.variant_id);
    setScan("");
  };

  const issue = useMutation({
    mutationFn: async () => {
      if (!pick) throw new Error("Pick a fabric roll");
      const m = num(meters);
      if (m <= 0) throw new Error("Enter metres to issue");
      if (blockOverIssue) throw new Error(`This is more than the design card needs plus ${allowedWastage}% allowed`);
      const { error } = await db.rpc("mfg_issue_fabric", { p_lot_id: lot.id, p_variant_id: pick, p_meters: m });
      if (error) throw error;
    },
    onSuccess: () => {
      setPick("");
      setMeters("");
      refresh();
    },
    onError: (e) => toast({ title: "Could not issue fabric", description: errMsg(e), variant: "destructive" }),
  });

  const cancelIssue = useMutation({
    mutationFn: async (rollId: string) => {
      const { error } = await db.rpc("mfg_cancel_fabric_issue", { p_lot_roll_id: rollId });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast({ title: "Could not undo", description: errMsg(e), variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const worker = workers.find((w) => w.key === workerKey);
      const { error } = await db.rpc("mfg_save_cutting", {
        p_lot_id: lot.id,
        p_cut: lot.sizes.map((s) => ({ lot_size_id: s.id, cut_qty: Math.max(num(cutValue(s)), 0) })),
        p_leftovers: activeRolls.map((r) => ({ lot_roll_id: r.id, leftover_meters: Math.max(num(leftover[r.id]), 0) })),
        p_end_bits_action: endBits,
        p_worker_type: worker?.type ?? null,
        p_employee_id: worker?.type === "employee" ? worker.id : null,
        p_supplier_id: worker?.type === "supplier" ? worker.id : null,
        p_worker_name: worker?.name ?? null,
        p_rate: Math.max(num(rate), 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmOpen(false);
      toast({ title: "Cutting saved", description: "Now send the pieces to the next stage." });
      refresh();
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast({ title: "Could not save cutting", description: errMsg(e), variant: "destructive" });
    },
  });

  const cutTotal = isOpen
    ? lot.sizes.reduce((s, x) => s + Math.max(num(cutValue(x)), 0), 0)
    : lot.sizes.reduce((s, x) => s + num(x.cut_qty), 0);

  // Actual fabric in pieces vs the design card.
  const returned = activeRolls.reduce((s, r) => s + (r.leftover_action === "stock" ? num(r.leftover_meters) : 0), 0);
  const wastedEnds = activeRolls.reduce((s, r) => s + (r.leftover_action === "wastage" ? num(r.leftover_meters) : 0), 0);
  const actualPerPiece = !isOpen && cutTotal > 0 ? (issuedTotal - returned) / cutTotal : 0;
  const overPct = perPiece > 0 && actualPerPiece > 0 ? ((actualPerPiece - perPiece) / perPiece) * 100 : 0;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg flex items-center gap-2"><Scissors className="h-5 w-5" /> Cutting</CardTitle>
        <CardDescription>
          {isOpen
            ? "Issue fabric rolls, then enter pieces cut per size and leftover metres, and save."
            : `Saved${lot.cut_at ? ` on ${new Date(lot.cut_at).toLocaleDateString("en-IN")}` : ""}${lot.cutting_worker_name ? ` · cut by ${lot.cutting_worker_name}` : ""}${num(lot.cutting_rate) ? ` · ${inr(lot.cutting_rate)} / pc` : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {perPiece > 0 && (
          <p className="text-sm text-muted-foreground">
            Design card: {mtr(perPiece)} per piece → about <b>{mtr(perPiece * plannedTotal)}</b> for {pcs(plannedTotal)} pcs.
            Issued so far: <b>{mtr(issuedTotal)}</b>.
          </p>
        )}

        {isOpen && (
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-3 space-y-1">
              <Label htmlFor="mfg_scan_roll">Scan roll barcode</Label>
              <Input id="mfg_scan_roll" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScan(); } }} />
            </div>
            <div className="col-span-12 sm:col-span-5 space-y-1">
              <Label>Fabric roll</Label>
              <SearchableSelect value={pick} onValueChange={choose} options={fabricOptions} allValue="" allLabel="Pick roll" triggerClassName="h-10" />
            </div>
            <div className="col-span-6 sm:col-span-2 space-y-1">
              <Label htmlFor="mfg_issue_m">Metres</Label>
              <Input id="mfg_issue_m" type="number" min={0} step="0.01" value={meters} onChange={(e) => setMeters(e.target.value)} />
            </div>
            <div className="col-span-6 sm:col-span-2">
              <Button className="w-full" onClick={() => issue.mutate()} disabled={issue.isPending || !pick || blockOverIssue}>Issue</Button>
            </div>
            {overIssue && (
              <p className={`col-span-12 text-sm rounded-md border px-3 py-2 ${blockOverIssue ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                This takes the lot to {mtr(afterIssue)}, {overPctAfter.toFixed(1)}% above the design card's {mtr(standardNeed)}
                {" "}(allowed {allowedWastage}%).{" "}
                {blockOverIssue ? "Settings block issuing more. Lower the metres or change the plan." : "Check before issuing."}
              </p>
            )}
          </div>
        )}

        {activeRolls.length > 0 && (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">Issued</TableHead>
                  <TableHead className="text-right">Leftover</TableHead>
                  {!isOpen && <TableHead>Leftover went to</TableHead>}
                  {isOpen && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRolls.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{rollLabel(r)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.variant?.barcode || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{mtr(r.issued_meters)}</TableCell>
                    <TableCell className="text-right">
                      {isOpen ? (
                        <Input type="number" min={0} step="0.01" className="h-8 w-24 ml-auto text-right" aria-label="Leftover metres"
                          value={leftover[r.id] ?? ""} placeholder="0"
                          onChange={(e) => setLeftover({ ...leftover, [r.id]: e.target.value })} />
                      ) : (
                        <span className="tabular-nums">{num(r.leftover_meters) ? mtr(r.leftover_meters) : "—"}</span>
                      )}
                    </TableCell>
                    {!isOpen && (
                      <TableCell>{num(r.leftover_meters) ? (r.leftover_action === "stock" ? "Back to stock" : "Wastage") : "—"}</TableCell>
                    )}
                    {isOpen && (
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" aria-label="Undo issue" disabled={cancelIssue.isPending}
                          onClick={() => cancelIssue.mutate(r.id)}>
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-base">Pieces {isOpen ? "cut" : "cut per size"}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {lot.sizes.map((s) => (
              <div key={s.id} className="border rounded-md p-2 space-y-1">
                <div className="text-xs text-muted-foreground">{sizeLabel(s.variant)} · plan {pcs(s.planned_qty)}</div>
                {isOpen ? (
                  <Input type="number" min={0} step="1" className="h-8 tabular-nums" aria-label={`Pieces cut ${sizeLabel(s.variant)}`}
                    value={cutValue(s)} onChange={(e) => setCut({ ...cut, [s.id]: e.target.value })} />
                ) : (
                  <div className="font-semibold tabular-nums">{pcs(s.cut_qty)}</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm tabular-nums">Total cut: <b>{pcs(cutTotal)}</b> of {pcs(plannedTotal)} planned</p>
        </div>

        {!isOpen && cutTotal > 0 && issuedTotal > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="border rounded-md p-2"><div className="text-xs text-muted-foreground">Fabric in pieces</div><b className="tabular-nums">{mtr(issuedTotal - returned - wastedEnds)}</b></div>
            <div className="border rounded-md p-2"><div className="text-xs text-muted-foreground">End bits wasted</div><b className="tabular-nums">{mtr(wastedEnds)}</b></div>
            <div className="border rounded-md p-2"><div className="text-xs text-muted-foreground">Used per piece</div><b className="tabular-nums">{mtr(actualPerPiece)}</b></div>
            <div className={`border rounded-md p-2 ${overPct > allowedWastage ? "border-red-300 bg-red-50 text-red-800" : ""}`}>
              <div className="text-xs opacity-80">Against design card</div>
              <b className="tabular-nums">{perPiece > 0 ? `${overPct >= 0 ? "+" : ""}${overPct.toFixed(1)}%` : "No design card"}</b>
            </div>
          </div>
        )}

        {isOpen && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Cutting done by</Label>
                <WorkerPicker workers={workers} workType={cuttingStage?.work_type} value={workerKey} onChange={setWorkerKey} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mfg_cut_rate">Cutting rate per piece ₹</Label>
                <Input id="mfg_cut_rate" type="number" min={0} step="0.5" value={rate} onChange={(e) => setRateInput(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Leftover fabric</Label>
                <Select value={endBits} onValueChange={(v) => setEndBits(v as MfgEndBitsDefault)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wastage">Count as wastage</SelectItem>
                    <SelectItem value="stock">Put back in stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setConfirmOpen(true)} disabled={cutTotal <= 0 || save.isPending}>
                <Scissors className="h-4 w-4 mr-1" /> Save cutting
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save cutting for {lot.lot_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pcs(cutTotal)} pieces cut from {mtr(issuedTotal)} of fabric. After saving, fabric and piece counts cannot be changed
              {endBits === "stock" ? ", and leftover metres go back to stock." : ", and leftover metres are counted as wastage."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); save.mutate(); }} disabled={save.isPending}>
              Save cutting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ───────────────────────────── Stages ─────────────────────────────

function SendDialog({
  orgId,
  lot,
  stage,
  available,
  defaultRate,
  workers,
  onClose,
  refresh,
}: {
  orgId: string;
  lot: MfgLot;
  stage: MfgStage | null;
  available: number;
  defaultRate: number;
  workers: MfgWorker[];
  onClose: () => void;
  refresh: () => void;
}) {
  const { toast } = useToast();
  const [workerKey, setWorkerKey] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [sentDate, setSentDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!stage) return;
    setWorkerKey("");
    setQty(String(available));
    setRate(defaultRate ? String(defaultRate) : "");
    const today = todayIso();
    setSentDate(today);
    setDueDate(stage.allowed_days != null ? addDays(today, stage.allowed_days) : "");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a stage is opened
  }, [stage?.id]);

  const send = useMutation({
    mutationFn: async () => {
      if (!stage) return;
      const worker = workers.find((w) => w.key === workerKey);
      if (!worker) throw new Error("Pick the worker");
      const q = num(qty);
      if (q <= 0) throw new Error("Enter pieces to send");
      if (q > available + 0.0005) throw new Error(`Only ${pcs(available)} pieces are ready for ${stage.name}`);
      const { error } = await db.from("mfg_job_cards").insert({
        organization_id: orgId,
        lot_id: lot.id,
        stage_id: stage.id,
        worker_type: worker.type,
        employee_id: worker.type === "employee" ? worker.id : null,
        supplier_id: worker.type === "supplier" ? worker.id : null,
        worker_name: worker.name,
        sent_qty: q,
        rate: Math.max(num(rate), 0),
        sent_date: sentDate || todayIso(),
        due_date: dueDate || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pieces sent" });
      onClose();
      refresh();
    },
    onError: (e) => toast({ title: "Could not send", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <Dialog open={!!stage} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to {stage?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Worker</Label>
            <WorkerPicker workers={workers} workType={stage?.work_type} value={workerKey} onChange={setWorkerKey} />
            <p className="text-xs text-muted-foreground">Staff come from Employee Master, job workers from Supplier Master.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="mfg_send_qty">Pieces (max {pcs(available)})</Label>
              <Input id="mfg_send_qty" type="number" min={0} step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mfg_send_rate">Rate per piece ₹</Label>
              <Input id="mfg_send_rate" type="number" min={0} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mfg_send_date">Sent on</Label>
              <Input id="mfg_send_date" type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mfg_due_date">Due back</Label>
              <Input id="mfg_due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mfg_send_notes">Notes</Label>
            <Input id="mfg_send_notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Challan no., instructions…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending}>Send pieces</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiveDialog({
  orgId,
  card,
  stageName,
  onClose,
  refresh,
}: {
  orgId: string;
  card: MfgJobCard | null;
  stageName: string;
  onClose: () => void;
  refresh: () => void;
}) {
  const { toast } = useToast();
  const remaining = card ? jobCardRemaining(card) : 0;
  const [good, setGood] = useState("");
  const [rejected, setRejected] = useState("");
  const [wasted, setWasted] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());

  useEffect(() => {
    if (!card) return;
    setGood(String(jobCardRemaining(card)));
    setRejected("");
    setWasted("");
    setReason("");
    setDate(todayIso());
  }, [card]);

  const total = num(good) + num(rejected) + num(wasted);

  const receive = useMutation({
    mutationFn: async () => {
      if (!card) return;
      if (total <= 0) throw new Error("Enter pieces received");
      if (total > remaining + 0.0005) throw new Error(`Only ${pcs(remaining)} pieces are pending with ${card.worker_name}`);
      if ((num(rejected) > 0 || num(wasted) > 0) && !reason.trim()) throw new Error("Write why pieces were rejected or wasted");
      const { error } = await db.from("mfg_job_receipts").insert({
        organization_id: orgId,
        job_card_id: card.id,
        lot_id: card.lot_id,
        good_qty: Math.max(num(good), 0),
        rejected_qty: Math.max(num(rejected), 0),
        wasted_qty: Math.max(num(wasted), 0),
        reason: reason.trim() || null,
        received_date: date || todayIso(),
      });
      // The card closes itself in the database once every piece is back.
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pieces received" });
      onClose();
      refresh();
    },
    onError: (e) => toast({ title: "Could not save", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive from {card?.worker_name} · {stageName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Pending with worker: <b className="tabular-nums">{pcs(remaining)}</b> pcs</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mfg_rcv_good">Good</Label>
            <Input id="mfg_rcv_good" type="number" min={0} step="1" value={good} onChange={(e) => setGood(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mfg_rcv_rej">Rejected</Label>
            <Input id="mfg_rcv_rej" type="number" min={0} step="1" value={rejected} onChange={(e) => setRejected(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mfg_rcv_waste">Wasted</Label>
            <Input id="mfg_rcv_waste" type="number" min={0} step="1" value={wasted} onChange={(e) => setWasted(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mfg_rcv_reason">Reason (for rejected / wasted)</Label>
            <Input id="mfg_rcv_reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Colour patch, torn, stain…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mfg_rcv_date">Received on</Label>
            <Input id="mfg_rcv_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {card && total > 0 && total < remaining && (
          <p className="text-xs text-muted-foreground">{pcs(remaining - total)} pcs will stay pending with {card.worker_name}.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => receive.mutate()} disabled={receive.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseShortDialog({ card, onClose, refresh }: { card: MfgJobCard | null; onClose: () => void; refresh: () => void }) {
  const { toast } = useToast();
  const remaining = card ? jobCardRemaining(card) : 0;
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [card]);

  const close = useMutation({
    mutationFn: async () => {
      if (!card) return;
      if (!note.trim()) throw new Error("Write what happened to the missing pieces");
      const { error } = await db
        .from("mfg_job_cards")
        .update({
          status: "closed",
          closed_short_qty: remaining,
          notes: [card.notes, `Closed short ${pcs(remaining)} pcs: ${note.trim()}`].filter(Boolean).join(" | "),
        })
        .eq("id", card.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Card closed", description: `${pcs(remaining)} pieces marked missing.` });
      onClose();
      refresh();
    },
    onError: (e) => toast({ title: "Could not close", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close short · {card?.worker_name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          <b className="tabular-nums">{pcs(remaining)}</b> pieces were not returned. They will be counted as missing on this lot.
        </p>
        <div className="space-y-1">
          <Label htmlFor="mfg_short_note">What happened?</Label>
          <Input id="mfg_short_note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => close.mutate()} disabled={close.isPending}>Mark missing &amp; close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const overdue = (c: MfgJobCard) => c.status === "open" && !!c.due_date && c.due_date < todayIso();

// ───────────────────────────── Finish ─────────────────────────────

function FinishSection({
  lot,
  readyForStock,
  pendingWithWorkers,
  cost,
  refresh,
}: {
  lot: MfgLot;
  readyForStock: number;
  pendingWithWorkers: number;
  cost: ReturnType<typeof computeLotCost>;
  refresh: () => void;
}) {
  const { toast } = useToast();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [closeLot, setCloseLot] = useState(false);
  const total = lot.sizes.reduce((s, x) => s + Math.max(num(qty[x.id]), 0), 0);

  useEffect(() => {
    setQty({});
  }, [lot.id, readyForStock]);

  useEffect(() => {
    setCloseLot(pendingWithWorkers <= 0 && total > 0 && Math.abs(total - readyForStock) < 0.0005);
  }, [pendingWithWorkers, total, readyForStock]);

  const finish = useMutation({
    mutationFn: async () => {
      if (total <= 0 && !closeLot) throw new Error("Enter ready pieces for at least one size");
      if (total > readyForStock + 0.0005) throw new Error(`Only ${pcs(readyForStock)} good pieces are ready`);
      for (const s of lot.sizes) {
        const left = num(s.cut_qty) - num(s.finished_qty);
        if (num(qty[s.id]) > left + 0.0005) throw new Error(`${sizeLabel(s.variant)}: only ${pcs(left)} cut pieces left`);
      }
      const { error } = await db.rpc("mfg_finish_lot", {
        p_lot_id: lot.id,
        p_items: lot.sizes.map((s) => ({ lot_size_id: s.id, qty: Math.max(num(qty[s.id]), 0) })).filter((x) => x.qty > 0),
        p_cost_per_piece: cost.per_piece,
        p_close: closeLot,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: closeLot ? "Lot finished" : "Pieces added to stock", description: `Cost ${inr(cost.per_piece)} per piece saved as purchase price.` });
      refresh();
    },
    onError: (e) => toast({ title: "Could not put into stock", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg flex items-center gap-2"><PackageCheck className="h-5 w-5" /> Product ready</CardTitle>
        <CardDescription>
          Good pieces from the last stage go into stock with the lot's cost as purchase price. Print barcodes from Barcode Printing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 grid grid-cols-2 sm:grid-cols-7 gap-2 text-sm">
          <div><div className="text-xs text-muted-foreground">Fabric ({mtr(cost.fabric_meters)})</div><div className="tabular-nums">{inr(cost.fabric)}</div></div>
          <div><div className="text-xs text-muted-foreground">Trims</div><div className="tabular-nums">{inr(cost.trims)}</div></div>
          <div><div className="text-xs text-muted-foreground">Cutting</div><div className="tabular-nums">{inr(cost.cutting)}</div></div>
          <div><div className="text-xs text-muted-foreground">Stage labour</div><div className="tabular-nums">{inr(cost.labour)}</div></div>
          <div><div className="text-xs text-muted-foreground">Other</div><div className="tabular-nums">{inr(cost.overhead)}</div></div>
          <div><div className="text-xs text-muted-foreground">Total</div><div className="tabular-nums">{inr(cost.total)}</div></div>
          <div><div className="text-xs text-muted-foreground">Cost per piece</div><div className="tabular-nums font-bold">{inr(cost.per_piece)}</div></div>
        </div>
        <p className="text-sm">
          Ready for stock: <b className="tabular-nums">{pcs(readyForStock)}</b> pcs
          {pendingWithWorkers > 0 && <span className="text-muted-foreground"> · {pcs(pendingWithWorkers)} still with workers</span>}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {lot.sizes.map((s) => (
            <div key={s.id} className="border rounded-md p-2 space-y-1">
              <div className="text-xs text-muted-foreground">
                {sizeLabel(s.variant)} · cut {pcs(s.cut_qty)} · in stock {pcs(s.finished_qty)}
              </div>
              <Input type="number" min={0} step="1" className="h-8 tabular-nums" aria-label={`Ready pieces ${sizeLabel(s.variant)}`}
                value={qty[s.id] ?? ""} placeholder="0" disabled={readyForStock <= 0}
                onChange={(e) => setQty({ ...qty, [s.id]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className={`flex items-center gap-2 text-sm ${pendingWithWorkers > 0 ? "opacity-60" : "cursor-pointer"}`}>
            <Checkbox checked={closeLot} disabled={pendingWithWorkers > 0} onCheckedChange={(v) => setCloseLot(!!v)} />
            Lot is complete (close it){pendingWithWorkers > 0 ? " · receive or close short the pieces with workers first" : ""}
          </label>
          <Button onClick={() => finish.mutate()} disabled={finish.isPending || (total <= 0 && !closeLot)}>
            <PackageCheck className="h-4 w-4 mr-1" /> {total > 0 ? `Put ${pcs(total)} pcs into stock` : "Close lot"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────── Lot screen ─────────────────────────────

export function LotDetail({
  orgId,
  lotId,
  allowedWastage,
  onBack,
}: {
  orgId: string;
  lotId: string;
  allowedWastage: number;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mfg = useManufacturerERP();
  const { data, isLoading, error } = useMfgLotDetail(lotId);
  const { data: stages = [] } = useMfgStages(orgId);
  const { data: designs = [] } = useMfgDesigns(orgId);
  const { data: products = [] } = useMfgProducts(orgId);
  const { data: workers = [] } = useMfgWorkers(orgId);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const [sendStageId, setSendStageId] = useState<string | null>(null);
  const [receiveCard, setReceiveCard] = useState<MfgJobCard | null>(null);
  const [shortCard, setShortCard] = useState<MfgJobCard | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: lotDetailKey(lotId) });
    void queryClient.invalidateQueries({ queryKey: lotsKey(orgId) });
    void queryClient.invalidateQueries({ queryKey: fabricStockKey(orgId) });
    void queryClient.invalidateQueries({ queryKey: openJobCardsKey(orgId) });
  };

  const cancelLot = useMutation({
    mutationFn: async () => {
      const { error: e } = await db.rpc("mfg_cancel_lot", { p_lot_id: lotId });
      if (e) throw e;
    },
    onSuccess: () => {
      setCancelOpen(false);
      toast({ title: "Lot cancelled", description: "Issued fabric went back to stock." });
      refresh();
    },
    onError: (e) => {
      setCancelOpen(false);
      toast({ title: "Could not cancel", description: errMsg(e), variant: "destructive" });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading lot…</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> All lots</Button>
        <p className="text-sm text-destructive">Could not load this lot. {errMsg(error)}</p>
      </div>
    );
  }

  const { lot, rolls, cards } = data;
  const design = designs.find((d) => d.id === lot.design_id);
  const cuttingStage = stages.find((s) => s.is_cutting && s.active) || stages.find((s) => s.is_cutting);
  const cutTotal = lot.sizes.reduce((s, x) => s + num(x.cut_qty), 0);
  const finishedTotal = lot.sizes.reduce((s, x) => s + num(x.finished_qty), 0);
  const plannedTotal = lot.sizes.reduce((s, x) => s + num(x.planned_qty), 0);
  const flow = computeLotFlow(lot.stage_ids, cutTotal, cards, finishedTotal);
  const pendingWithWorkers = flow.stages.reduce((s, x) => s + x.pending, 0);
  const cost = computeLotCost({
    rolls: rolls.filter((r) => !r.cancelled_at),
    trimsPerPiece: designTrimsPerPiece(design, productById),
    cutTotal,
    cuttingRate: num(lot.cutting_rate),
    cards,
    overheadPerPiece: num(design?.overhead_per_piece),
    goodPieces: flow.output,
  });
  const sendStage = sendStageId ? stageById.get(sendStageId) || null : null;
  const sendFlow = flow.stages.find((x) => x.stage_id === sendStageId);
  const canWork = lot.status === "cut";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> All lots</Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{lot.lot_no}</h2>
              <LotStatusBadge status={lot.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {lot.product?.product_name || "—"}
              {lot.design ? ` · Design ${lot.design.design_no}` : ""} · {new Date(lot.lot_date).toLocaleDateString("en-IN")}
              {lot.notes ? ` · ${lot.notes}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="tabular-nums">Planned {pcs(plannedTotal)}</Badge>
          <Badge variant="outline" className="tabular-nums">Cut {pcs(cutTotal)}</Badge>
          <Badge variant="outline" className="tabular-nums">In stock {pcs(finishedTotal)}</Badge>
          {lot.status === "open" && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Cancel lot
            </Button>
          )}
        </div>
      </div>

      {lot.status !== "cancelled" && (
        <CuttingSection orgId={orgId} lot={lot} rolls={rolls} design={design} productById={productById}
          cuttingStage={cuttingStage} workers={workers} allowedWastage={allowedWastage}
          overIssueAction={mfg.over_issue_action} refresh={refresh} />
      )}

      {lot.status !== "open" && lot.status !== "cancelled" && lot.stage_ids.length > 0 && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2"><Send className="h-5 w-5" /> Stages</CardTitle>
            <CardDescription>Send pieces to a worker, then receive good, rejected and wasted pieces back.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {flow.stages.map((f, i) => {
              const stage = stageById.get(f.stage_id);
              const own = cards.filter((c) => c.stage_id === f.stage_id);
              const unexplained = f.input - f.available - f.good - f.rejected - f.wasted - f.missing - f.pending;
              return (
                <div key={f.stage_id} className="border rounded-md">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/40">
                    <div className="font-semibold">{i + 1}. {stage?.name || "Stage removed"}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                      <span>In {pcs(f.input)}</span>
                      <span>· Not sent {pcs(f.available)}</span>
                      <span>· With workers {pcs(f.pending)}</span>
                      <span className="text-green-700">· Good {pcs(f.good)}</span>
                      {f.rejected > 0 && <span className="text-amber-700">· Rejected {pcs(f.rejected)}</span>}
                      {f.wasted > 0 && <span className="text-amber-700">· Wasted {pcs(f.wasted)}</span>}
                      {f.missing > 0 && <span className="text-red-700 font-semibold">· Missing {pcs(f.missing)}</span>}
                      {Math.abs(unexplained) > 0.0005 && <span className="text-red-700 font-semibold">· Not explained {pcs(unexplained)}</span>}
                      {canWork && stage && f.available > 0 && (
                        <Button size="sm" onClick={() => setSendStageId(f.stage_id)}>Send</Button>
                      )}
                    </div>
                  </div>
                  {own.length > 0 && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Worker</TableHead>
                            <TableHead>Sent on</TableHead>
                            <TableHead className="text-right">Sent</TableHead>
                            <TableHead className="text-right">Good</TableHead>
                            <TableHead className="text-right">Rej / Waste</TableHead>
                            <TableHead className="text-right">Pending</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {own.map((c) => {
                            const good = c.receipts.reduce((s, r) => s + num(r.good_qty), 0);
                            const bad = c.receipts.reduce((s, r) => s + num(r.rejected_qty) + num(r.wasted_qty), 0);
                            const rem = jobCardRemaining(c);
                            return (
                              <TableRow key={c.id}>
                                <TableCell>
                                  {c.worker_name}
                                  <span className="text-xs text-muted-foreground"> · {c.worker_type === "employee" ? "Staff" : "Job worker"}</span>
                                  {overdue(c) && <Badge variant="destructive" className="ml-2">Late</Badge>}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{new Date(c.sent_date).toLocaleDateString("en-IN")}</TableCell>
                                <TableCell className="text-right tabular-nums">{pcs(c.sent_qty)}</TableCell>
                                <TableCell className="text-right tabular-nums">{pcs(good)}</TableCell>
                                <TableCell className="text-right tabular-nums">{bad ? pcs(bad) : "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {c.status === "closed" ? (num(c.closed_short_qty) > 0 ? <span className="text-red-700">{pcs(c.closed_short_qty)} missing</span> : "Done") : pcs(rem)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{inr(c.rate)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {c.status === "open" && canWork && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => setReceiveCard(c)}>Receive</Button>
                                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setShortCard(c)}>Close short</Button>
                                    </>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {lot.status === "cut" && (
        <FinishSection lot={lot} readyForStock={flow.readyForStock} pendingWithWorkers={pendingWithWorkers} cost={cost} refresh={refresh} />
      )}

      {lot.status === "finished" && (
        <Card>
          <CardContent className="py-4 text-sm grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><div className="text-xs text-muted-foreground">Ready pieces in stock</div><b className="tabular-nums">{pcs(finishedTotal)}</b></div>
            <div><div className="text-xs text-muted-foreground">Lost on the way</div><b className="tabular-nums">{pcs(Math.max(cutTotal - finishedTotal, 0))}</b></div>
            <div><div className="text-xs text-muted-foreground">Total cost</div><b className="tabular-nums">{inr(cost.total)}</b></div>
            <div><div className="text-xs text-muted-foreground">Cost per piece</div><b className="tabular-nums">{inr(cost.per_piece)}</b></div>
          </CardContent>
        </Card>
      )}

      <SendDialog orgId={orgId} lot={lot} stage={sendStage} available={sendFlow?.available ?? 0}
        defaultRate={stageRate(design, sendStage || undefined)} workers={workers}
        onClose={() => setSendStageId(null)} refresh={refresh} />
      <ReceiveDialog orgId={orgId} card={receiveCard} stageName={receiveCard ? stageById.get(receiveCard.stage_id)?.name || "" : ""}
        onClose={() => setReceiveCard(null)} refresh={refresh} />
      <CloseShortDialog card={shortCard} onClose={() => setShortCard(null)} refresh={refresh} />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {lot.lot_no}?</AlertDialogTitle>
            <AlertDialogDescription>Fabric issued to this lot goes back to stock. The lot stays in the list as cancelled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep lot</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); cancelLot.mutate(); }} disabled={cancelLot.isPending}>
              Cancel lot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
