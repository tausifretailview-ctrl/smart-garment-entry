import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useManufacturerERP } from "@/hooks/useManufacturerERP";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowLeft, ArrowUp, Factory, Pencil, Plus, Trash2 } from "lucide-react";
import {
  computeDesignStandardCost,
  DEFAULT_MFG_STAGES,
  jobCardRemaining,
  MFG_WORK_TYPE_LABEL,
  piecesFromMeters,
  type MfgWorkType,
} from "@/utils/manufacturing";
import {
  db,
  designsKey,
  inr,
  isMtr,
  MFG_CARD,
  MFG_CARD_TITLE,
  MFG_HEAD_ROW,
  MFG_ROW,
  MFG_TABLE,
  MFG_TH,
  MFG_THEAD,
  mtr,
  pcs,
  stagesKey,
  useFabricStock,
  useMfgDesigns,
  useMfgLots,
  useMfgProducts,
  useMfgStages,
  useOpenJobCards,
  type MfgDesign,
  type MfgStage,
} from "@/components/manufacturing/mfgData";
import { LotsTab } from "@/components/manufacturing/LotsTab";
import { PendingWorkTab } from "@/components/manufacturing/PendingWorkTab";

// ─────────────────────────────── Stages ───────────────────────────────

const emptyStageForm = {
  name: "",
  work_type: "both" as MfgWorkType,
  default_rate: "",
  allowed_days: "",
  allowed_wastage_percent: "",
  notes: "",
  active: true,
  is_cutting: false,
};

function StagesTab({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: stages = [], isLoading } = useMfgStages(orgId);
  const [editing, setEditing] = useState<MfgStage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyStageForm);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: stagesKey(orgId) });
  const fail = (e: unknown) =>
    toast({ title: "Could not save", description: (e as Error)?.message || "Please try again", variant: "destructive" });

  const addDefaults = useMutation({
    mutationFn: async () => {
      const existing = new Set(stages.map((s) => s.name.trim().toLowerCase()));
      let seq = stages.reduce((m, s) => Math.max(m, s.sequence), 0);
      const rows = DEFAULT_MFG_STAGES.filter((s) => !existing.has(s.name.toLowerCase())).map((s) => ({
        organization_id: orgId,
        name: s.name,
        work_type: s.work_type,
        is_cutting: s.name === "Cutting",
        sequence: (seq += 10),
      }));
      if (rows.length === 0) return;
      const { error } = await db.from("mfg_stages").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Stages added", description: "Rename or reorder them any time." });
    },
    onError: fail,
  });

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Enter a stage name");
      const toNum = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));
      const row = {
        name,
        work_type: form.work_type,
        default_rate: toNum(form.default_rate) ?? 0,
        allowed_days: form.allowed_days.trim() === "" ? null : Math.max(0, Math.floor(Number(form.allowed_days) || 0)),
        allowed_wastage_percent: toNum(form.allowed_wastage_percent),
        notes: form.notes.trim() || null,
        active: form.active,
        is_cutting: form.is_cutting,
      };
      if (editing) {
        const { error } = await db.from("mfg_stages").update(row).eq("id", editing.id);
        if (error) throw error;
      } else {
        const nextSeq = stages.reduce((m, s) => Math.max(m, s.sequence), 0) + 10;
        const { error } = await db.from("mfg_stages").insert({ ...row, organization_id: orgId, sequence: nextSeq });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refresh();
      setDialogOpen(false);
      toast({ title: editing ? "Stage updated" : "Stage added" });
    },
    onError: (e: unknown) => {
      const msg = (e as Error)?.message || "";
      if (msg.includes("mfg_stages_name_uq")) {
        toast({ title: "Name already used", description: "Another stage has this name.", variant: "destructive" });
      } else fail(e);
    },
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const a = stages[index];
      const b = stages[index + dir];
      if (!a || !b) return;
      // Renumber the whole list so equal sequence numbers never get stuck.
      const ordered = [...stages];
      ordered[index] = b;
      ordered[index + dir] = a;
      for (let i = 0; i < ordered.length; i++) {
        const seq = (i + 1) * 10;
        if (ordered[i].sequence === seq) continue;
        const { error } = await db.from("mfg_stages").update({ sequence: seq }).eq("id", ordered[i].id);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: async (stage: MfgStage) => {
      const { error } = await db.from("mfg_stages").delete().eq("id", stage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Stage deleted" });
    },
    onError: (e: unknown) =>
      toast({
        title: "Could not delete",
        description: "Only an admin can delete a stage. You can switch it off instead. " + ((e as Error)?.message || ""),
        variant: "destructive",
      }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyStageForm);
    setDialogOpen(true);
  };

  const openEdit = (s: MfgStage) => {
    setEditing(s);
    setForm({
      name: s.name,
      work_type: s.work_type,
      default_rate: s.default_rate ? String(s.default_rate) : "",
      allowed_days: s.allowed_days != null ? String(s.allowed_days) : "",
      allowed_wastage_percent: s.allowed_wastage_percent != null ? String(s.allowed_wastage_percent) : "",
      notes: s.notes || "",
      active: s.active,
      is_cutting: !!s.is_cutting,
    });
    setDialogOpen(true);
  };

  return (
    <Card className={MFG_CARD}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-slate-100 px-4 py-3">
        <div className="space-y-1">
          <CardTitle className={MFG_CARD_TITLE}>Process stages</CardTitle>
          <CardDescription className="text-xs">
            The steps every lot goes through, in order. Product ready is the last step and is added automatically.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {stages.length === 0 && !isLoading && (
            <Button variant="outline" onClick={() => addDefaults.mutate()} disabled={addDefaults.isPending}>
              Add default stages
            </Button>
          )}
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add stage
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading stages…</p>
        ) : stages.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="font-medium">No stages yet</p>
            <p className="text-sm text-muted-foreground">
              Click "Add default stages" for Cutting, Polishing, Colouring, Master Sheet Ready, Button &amp; Other Work and Ironing.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className={MFG_TABLE}>
              <TableHeader className={MFG_THEAD}>
                <TableRow className={MFG_HEAD_ROW}>
                  <TableHead className={cn(MFG_TH, "w-12")}>#</TableHead>
                  <TableHead className={MFG_TH}>Stage</TableHead>
                  <TableHead className={MFG_TH}>Done by</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Rate / pc</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Allowed days</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Allowed wastage</TableHead>
                  <TableHead className={MFG_TH}>Status</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((s, i) => (
                  <TableRow key={s.id} className={cn(MFG_ROW, s.active ? "" : "opacity-60")}>
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.is_cutting && <Badge variant="outline" className="ml-2">Cutting step</Badge>}
                      {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                    </TableCell>
                    <TableCell>{MFG_WORK_TYPE_LABEL[s.work_type] || s.work_type}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.default_rate ? inr(s.default_rate) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.allowed_days ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.allowed_wastage_percent != null ? `${s.allowed_wastage_percent}%` : "Shop default"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "On" : "Off"}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0 || move.isPending}
                        onClick={() => move.mutate({ index: i, dir: -1 })}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === stages.length - 1 || move.isPending}
                        onClick={() => move.mutate({ index: i, dir: 1 })}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Edit stage" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete stage" disabled={remove.isPending}
                        onClick={() => remove.mutate(s)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit stage" : "Add stage"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="mfg_stage_name">Stage name</Label>
              <Input id="mfg_stage_name" value={form.name} maxLength={60} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Stitching" />
            </div>
            <div className="space-y-1">
              <Label>Done by</Label>
              <Select value={form.work_type} onValueChange={(v) => setForm({ ...form, work_type: v as MfgWorkType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MFG_WORK_TYPE_LABEL) as MfgWorkType[]).map((k) => (
                    <SelectItem key={k} value={k}>{MFG_WORK_TYPE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="mfg_stage_rate">Rate per piece ₹</Label>
                <Input id="mfg_stage_rate" type="number" min={0} step="0.5" value={form.default_rate}
                  onChange={(e) => setForm({ ...form, default_rate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mfg_stage_days">Allowed days</Label>
                <Input id="mfg_stage_days" type="number" min={0} step="1" value={form.allowed_days}
                  onChange={(e) => setForm({ ...form, allowed_days: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mfg_stage_wastage">Allowed wastage %</Label>
                <Input id="mfg_stage_wastage" type="number" min={0} max={100} step="0.5" value={form.allowed_wastage_percent}
                  placeholder="Shop default"
                  onChange={(e) => setForm({ ...form, allowed_wastage_percent: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mfg_stage_notes">What happens in this stage (optional)</Label>
              <Textarea id="mfg_stage_notes" rows={2} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3 gap-3">
              <div>
                <Label htmlFor="mfg_stage_cutting">This is the cutting step</Label>
                <p className="text-xs text-muted-foreground">Fabric is issued and pieces are counted on the lot's Cutting screen</p>
              </div>
              <Switch id="mfg_stage_cutting" checked={form.is_cutting} onCheckedChange={(v) => setForm({ ...form, is_cutting: v })} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label htmlFor="mfg_stage_active">Stage is in use</Label>
              <Switch id="mfg_stage_active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────────────────────────── Design cards ─────────────────────────────

interface DesignForm {
  id: string | null;
  design_no: string;
  design_name: string;
  finished_product_id: string;
  overhead_per_piece: string;
  notes: string;
  active: boolean;
  materials: { material_product_id: string; qty_per_piece: string; wastage_percent: string }[];
  stage_rates: Record<string, string>;
}

function DesignsTab({ orgId, allowedWastage }: { orgId: string; allowedWastage: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: stages = [] } = useMfgStages(orgId);
  const activeStages = useMemo(() => stages.filter((s) => s.active), [stages]);
  const { data: products = [] } = useMfgProducts(orgId);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [form, setForm] = useState<DesignForm | null>(null);

  const { data: designs = [], isLoading } = useMfgDesigns(orgId);

  const { data: fabricStock = [] } = useFabricStock(orgId);
  const metersByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of fabricStock) m.set(r.product_id, (m.get(r.product_id) || 0) + Number(r.meters_left || 0));
    return m;
  }, [fabricStock]);

  const costOf = (
    materials: { material_product_id: string; qty_per_piece: number; wastage_percent: number }[],
    rates: number[],
    overhead: number,
  ) =>
    computeDesignStandardCost(
      materials.map((m) => {
        const p = productById.get(m.material_product_id);
        return {
          material_type: (isMtr(p) ? "fabric" : "trim") as "fabric" | "trim",
          qty_per_piece: m.qty_per_piece,
          wastage_percent: m.wastage_percent,
          unit_price: Number(p?.default_pur_price || 0),
        };
      }),
      rates,
      overhead,
    );

  const designCost = (d: MfgDesign) => {
    const rateByStage = new Map(d.stage_rates.map((r) => [r.stage_id, Number(r.rate)]));
    return costOf(
      d.materials.map((m) => ({ ...m, qty_per_piece: Number(m.qty_per_piece), wastage_percent: Number(m.wastage_percent) })),
      activeStages.map((s) => rateByStage.get(s.id) ?? Number(s.default_rate || 0)),
      Number(d.overhead_per_piece || 0),
    );
  };

  /** Pieces the fabric in stock can still make, limited by the scarcest fabric on the card. */
  const piecesPossible = (d: MfgDesign) => {
    const fabrics = d.materials.filter((m) => isMtr(productById.get(m.material_product_id)));
    if (fabrics.length === 0) return null;
    return Math.min(
      ...fabrics.map((m) =>
        piecesFromMeters(
          metersByProduct.get(m.material_product_id) || 0,
          Number(m.qty_per_piece) * (1 + Number(m.wastage_percent || 0) / 100),
        ),
      ),
    );
  };

  const openNew = () =>
    setForm({
      id: null,
      design_no: "",
      design_name: "",
      finished_product_id: "",
      overhead_per_piece: "",
      notes: "",
      active: true,
      materials: [{ material_product_id: "", qty_per_piece: "", wastage_percent: String(allowedWastage) }],
      stage_rates: Object.fromEntries(activeStages.map((s) => [s.id, s.default_rate ? String(s.default_rate) : ""])),
    });

  const openEdit = (d: MfgDesign) => {
    const rateByStage = new Map(d.stage_rates.map((r) => [r.stage_id, String(r.rate)]));
    setForm({
      id: d.id,
      design_no: d.design_no,
      design_name: d.design_name || "",
      finished_product_id: d.finished_product_id || "",
      overhead_per_piece: d.overhead_per_piece ? String(d.overhead_per_piece) : "",
      notes: d.notes || "",
      active: d.active,
      materials: d.materials.map((m) => ({
        material_product_id: m.material_product_id,
        qty_per_piece: String(m.qty_per_piece),
        wastage_percent: String(m.wastage_percent ?? 0),
      })),
      stage_rates: Object.fromEntries(
        activeStages.map((s) => [s.id, rateByStage.get(s.id) ?? (s.default_rate ? String(s.default_rate) : "")]),
      ),
    });
  };

  const formCost = form
    ? costOf(
        form.materials
          .filter((m) => m.material_product_id)
          .map((m) => ({
            material_product_id: m.material_product_id,
            qty_per_piece: Number(m.qty_per_piece) || 0,
            wastage_percent: Number(m.wastage_percent) || 0,
          })),
        activeStages.map((s) => Number(form.stage_rates[s.id]) || 0),
        Number(form.overhead_per_piece) || 0,
      )
    : null;

  const save = useMutation({
    mutationFn: async (f: DesignForm) => {
      const designNo = f.design_no.trim();
      if (!designNo) throw new Error("Enter a design number");
      const materials = f.materials
        .filter((m) => m.material_product_id && Number(m.qty_per_piece) > 0)
        .map((m, i) => ({
          organization_id: orgId,
          material_product_id: m.material_product_id,
          material_type: isMtr(productById.get(m.material_product_id)) ? "fabric" : "trim",
          qty_per_piece: Number(m.qty_per_piece),
          wastage_percent: Math.min(Math.max(Number(m.wastage_percent) || 0, 0), 100),
          sort_order: i,
        }));
      if (materials.length === 0) throw new Error("Add at least one fabric or trim with a quantity per piece");

      const header = {
        design_no: designNo,
        design_name: f.design_name.trim() || null,
        finished_product_id: f.finished_product_id || null,
        overhead_per_piece: Math.max(Number(f.overhead_per_piece) || 0, 0),
        notes: f.notes.trim() || null,
        active: f.active,
      };

      let designId = f.id;
      if (designId) {
        const { error } = await db.from("mfg_designs").update(header).eq("id", designId);
        if (error) throw error;
        const delM = await db.from("mfg_design_materials").delete().eq("design_id", designId);
        if (delM.error) throw delM.error;
        const delR = await db.from("mfg_design_stage_rates").delete().eq("design_id", designId);
        if (delR.error) throw delR.error;
      } else {
        const { data, error } = await db
          .from("mfg_designs")
          .insert({ ...header, organization_id: orgId })
          .select("id")
          .single();
        if (error) throw error;
        designId = data.id as string;
      }

      const insM = await db.from("mfg_design_materials").insert(materials.map((m) => ({ ...m, design_id: designId })));
      if (insM.error) throw insM.error;

      const rates = activeStages
        .map((s) => ({ stage_id: s.id, rate: Math.max(Number(f.stage_rates[s.id]) || 0, 0) }))
        .map((r) => ({ ...r, organization_id: orgId, design_id: designId }));
      if (rates.length > 0) {
        const insR = await db.from("mfg_design_stage_rates").insert(rates);
        if (insR.error) throw insR.error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: designsKey(orgId) });
      setForm(null);
      toast({ title: "Design card saved" });
    },
    onError: (e: unknown) => {
      const msg = (e as Error)?.message || "Please try again";
      toast({
        title: "Could not save",
        description: msg.includes("mfg_designs_no_uq") ? "This design number is already used." : msg,
        variant: "destructive",
      });
    },
  });

  const fabricOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.product_name}${isMtr(p) ? " (MTR)" : ""}` })),
    [products],
  );
  const finishedOptions = useMemo(
    () => products.filter((p) => !isMtr(p)).map((p) => ({ value: p.id, label: p.product_name })),
    [products],
  );

  return (
    <Card className={MFG_CARD}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-slate-100 px-4 py-3">
        <div className="space-y-1">
          <CardTitle className={MFG_CARD_TITLE}>Design cards</CardTitle>
          <CardDescription className="text-xs">
            What one piece needs: fabric metres, buttons and trims, and the rate paid at each stage. Every lot is checked against this.
          </CardDescription>
        </div>
        <Button onClick={openNew} disabled={activeStages.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> New design card
        </Button>
      </CardHeader>
      <CardContent className="p-4">
        {activeStages.length === 0 && (
          <p className="text-sm text-amber-700 mb-3">Add your stages first, in the Stages tab.</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading design cards…</p>
        ) : designs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No design cards yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className={MFG_TABLE}>
              <TableHeader className={MFG_THEAD}>
                <TableRow className={MFG_HEAD_ROW}>
                  <TableHead className={MFG_TH}>Design</TableHead>
                  <TableHead className={MFG_TH}>Finished product</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Fabric / pc</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Fabric ₹</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Trims ₹</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Labour ₹</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Cost / pc</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Can make now</TableHead>
                  <TableHead className={MFG_TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {designs.map((d) => {
                  const c = designCost(d);
                  const canMake = piecesPossible(d);
                  return (
                    <TableRow key={d.id} className={cn(MFG_ROW, d.active ? "" : "opacity-60")}>
                      <TableCell className="font-medium">
                        {d.design_no}
                        {d.design_name && <div className="text-xs text-muted-foreground">{d.design_name}</div>}
                      </TableCell>
                      <TableCell>{(d.finished_product_id && productById.get(d.finished_product_id)?.product_name) || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.fabric_meters ? mtr(c.fabric_meters) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(c.fabric)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(c.trims)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(c.labour)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{inr(c.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{canMake == null ? "—" : `${canMake} pcs`}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" aria-label="Edit design card" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit design card" : "New design card"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mfg_design_no">Design no.</Label>
                  <Input id="mfg_design_no" value={form.design_no} maxLength={40}
                    onChange={(e) => setForm({ ...form, design_no: e.target.value })} placeholder="e.g. SH-101" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mfg_design_name">Design name</Label>
                  <Input id="mfg_design_name" value={form.design_name}
                    onChange={(e) => setForm({ ...form, design_name: e.target.value })} placeholder="e.g. Cotton shirt full sleeve" />
                </div>
                <div className="space-y-1">
                  <Label>Finished product</Label>
                  <SearchableSelect
                    value={form.finished_product_id}
                    onValueChange={(v) => setForm({ ...form, finished_product_id: v })}
                    options={finishedOptions}
                    allValue=""
                    allLabel="Not linked yet"
                    triggerClassName="h-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Fabric &amp; trims for one piece</Label>
                  <Button size="sm" variant="outline"
                    onClick={() => setForm({
                      ...form,
                      materials: [...form.materials, { material_product_id: "", qty_per_piece: "", wastage_percent: "0" }],
                    })}>
                    <Plus className="h-4 w-4 mr-1" /> Add line
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.materials.map((m, i) => {
                    const p = productById.get(m.material_product_id);
                    const unit = isMtr(p) ? "m" : (p?.uom || "pcs").toLowerCase();
                    const setLine = (patch: Partial<DesignForm["materials"][number]>) =>
                      setForm({ ...form, materials: form.materials.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-12 sm:col-span-6 space-y-1">
                          {i === 0 && <span className="text-xs text-muted-foreground">Fabric or trim</span>}
                          <SearchableSelect
                            value={m.material_product_id}
                            onValueChange={(v) => setLine({ material_product_id: v })}
                            options={fabricOptions}
                            allValue=""
                            allLabel="Pick product"
                            triggerClassName="h-10"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-2 space-y-1">
                          {i === 0 && <span className="text-xs text-muted-foreground">Per piece ({unit})</span>}
                          <Input type="number" min={0} step="0.01" value={m.qty_per_piece} aria-label="Quantity per piece"
                            onChange={(e) => setLine({ qty_per_piece: e.target.value })} />
                        </div>
                        <div className="col-span-5 sm:col-span-3 space-y-1">
                          {i === 0 && <span className="text-xs text-muted-foreground">Wastage %</span>}
                          <Input type="number" min={0} max={100} step="0.5" value={m.wastage_percent} aria-label="Wastage percent"
                            onChange={(e) => setLine({ wastage_percent: e.target.value })} />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end">
                          <Button size="icon" variant="ghost" aria-label="Remove line"
                            onClick={() => setForm({ ...form, materials: form.materials.filter((_, j) => j !== i) })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Products with unit MTR count as fabric; everything else (buttons, thread, labels) counts as trims. Price comes from the product's purchase price.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-base">Rate paid per piece at each stage</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {activeStages.map((s) => (
                    <div key={s.id} className="space-y-1">
                      <Label htmlFor={`mfg_rate_${s.id}`} className="text-xs text-muted-foreground">{s.name} ₹</Label>
                      <Input id={`mfg_rate_${s.id}`} type="number" min={0} step="0.5" value={form.stage_rates[s.id] ?? ""}
                        onChange={(e) => setForm({ ...form, stage_rates: { ...form.stage_rates, [s.id]: e.target.value } })} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mfg_overhead">Other cost per piece ₹</Label>
                  <Input id="mfg_overhead" type="number" min={0} step="0.5" value={form.overhead_per_piece}
                    onChange={(e) => setForm({ ...form, overhead_per_piece: e.target.value })} placeholder="Rent, power…" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="mfg_design_notes">Notes</Label>
                  <Input id="mfg_design_notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              {formCost && (
                <div className="rounded-md border bg-muted/40 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                  <div><div className="text-xs text-muted-foreground">Fabric</div><div className="tabular-nums">{inr(formCost.fabric)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Trims</div><div className="tabular-nums">{inr(formCost.trims)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Labour</div><div className="tabular-nums">{inr(formCost.labour)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Other</div><div className="tabular-nums">{inr(formCost.overhead)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Standard cost / pc</div><div className="tabular-nums font-bold">{inr(formCost.total)}</div></div>
                </div>
              )}

              <div className="flex items-center justify-between border rounded-md p-3">
                <Label htmlFor="mfg_design_active">Design is in use</Label>
                <Switch id="mfg_design_active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => form && save.mutate(form)} disabled={save.isPending}>Save design card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────────────────────────── Fabric stock ─────────────────────────────

function FabricStockTab({ orgId }: { orgId: string }) {
  const { data: rows = [], isLoading, error } = useFabricStock(orgId);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.product_name, r.color, r.barcode].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      meters: filtered.reduce((s, r) => s + Number(r.meters_left || 0), 0),
      value: filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0),
      rolls: filtered.filter((r) => r.is_roll && Number(r.meters_left) > 0).length,
    }),
    [filtered],
  );

  return (
    <Card className={MFG_CARD}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-slate-100 px-4 py-3">
        <div className="space-y-1">
          <CardTitle className={MFG_CARD_TITLE}>Fabric stock in metres</CardTitle>
          <CardDescription className="text-xs">
            Every roll bought in MTR, with metres left after fabric issued to production.
          </CardDescription>
        </div>
        <Input className="w-full sm:w-64" placeholder="Search fabric, colour, barcode" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search fabric stock" />
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary" className="tabular-nums">{totals.rolls} rolls</Badge>
          <Badge variant="secondary" className="tabular-nums">{mtr(totals.meters)} left</Badge>
          <Badge variant="secondary" className="tabular-nums">{inr(totals.value)} value</Badge>
        </div>
        {error ? (
          <p className="text-sm text-destructive py-6 text-center">
            Could not load fabric stock. If this is a new setup, the Manufacturer ERP database update may not be applied yet.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading fabric stock…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No MTR fabric in stock. Buy fabric in Purchase Entry with unit MTR (turn on "Roll-wise Entry for MTR Products" in Settings &gt; Purchase for one barcode per roll).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className={MFG_TABLE}>
              <TableHeader className={MFG_THEAD}>
                <TableRow className={MFG_HEAD_ROW}>
                  <TableHead className={MFG_TH}>Fabric</TableHead>
                  <TableHead className={MFG_TH}>Colour</TableHead>
                  <TableHead className={MFG_TH}>Barcode</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Roll length</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Bought (in stock)</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Used</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Left</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Rate / m</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.variant_id} className={MFG_ROW}>
                    <TableCell className="font-medium">{r.product_name}</TableCell>
                    <TableCell>{r.color || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.barcode || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.is_roll && r.roll_meters != null
                        ? `${mtr(r.roll_meters)}${Number(r.rolls_in_stock) > 1 ? ` × ${r.rolls_in_stock}` : ""}`
                        : "Loose"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{mtr(r.meters_purchased_in_stock)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.meters_used) ? mtr(r.meters_used) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{mtr(r.meters_left)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.pur_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.stock_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────── Page ───────────────────────────────

const KPI_CARD = "rounded-lg bg-gradient-to-br px-3 py-2 min-w-0 shadow-sm";
const KPI_LABEL = "text-xs font-medium text-white/80 leading-none";
const KPI_VALUE = "text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate";
const KPI_SUB = "text-[10px] text-white/70 mt-0.5 truncate";

/** Coloured totals strip, same look as Customer Balances. */
function ManufacturingKpis({ orgId }: { orgId: string }) {
  const { data: lots = [] } = useMfgLots(orgId);
  const { data: cards = [] } = useOpenJobCards(orgId);
  const { data: fabric = [] } = useFabricStock(orgId);

  const k = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    let cutting = 0, inProcess = 0, finishedLots = 0, finishedPcs = 0;
    for (const l of lots) {
      if (l.status === "open") cutting += 1;
      else if (l.status === "cut") inProcess += 1;
      else if (l.status === "finished" && (l.finished_at || "").slice(0, 7) === month) {
        finishedLots += 1;
        finishedPcs += l.sizes.reduce((s, x) => s + (Number(x.finished_qty) || 0), 0);
      }
    }
    let withWorkers = 0, late = 0;
    for (const c of cards) {
      if (c.lot?.status !== "cut") continue;
      const left = jobCardRemaining(c);
      withWorkers += left;
      if (c.due_date && c.due_date < today) late += left;
    }
    const meters = fabric.reduce((s, f) => s + (Number(f.meters_left) || 0), 0);
    const value = fabric.reduce((s, f) => s + (Number(f.stock_value) || 0), 0);
    return { cutting, inProcess, finishedLots, finishedPcs, withWorkers, late, meters, value };
  }, [lots, cards, fabric]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full shrink-0">
      <div className={cn(KPI_CARD, "from-blue-500 to-blue-600")}>
        <p className={KPI_LABEL}>Lots running</p>
        <p className={KPI_VALUE}>{pcs(k.cutting + k.inProcess)}</p>
        <p className={KPI_SUB}>{pcs(k.cutting)} cutting pending · {pcs(k.inProcess)} in process</p>
      </div>
      <div className={cn(KPI_CARD, k.late > 0 ? "from-red-500 to-red-600" : "from-amber-500 to-amber-600")}>
        <p className={KPI_LABEL}>Pieces with workers</p>
        <p className={KPI_VALUE}>{pcs(k.withWorkers)} pcs</p>
        <p className={KPI_SUB}>{k.late > 0 ? `${pcs(k.late)} pcs late` : "Nothing late"}</p>
      </div>
      <div className={cn(KPI_CARD, "from-emerald-500 to-emerald-600")}>
        <p className={KPI_LABEL}>Fabric in stock</p>
        <p className={KPI_VALUE}>{mtr(k.meters)}</p>
        <p className={KPI_SUB}>Worth {inr(k.value)}</p>
      </div>
      <div className={cn(KPI_CARD, "from-violet-500 to-violet-600")}>
        <p className={KPI_LABEL}>Lots finished this month</p>
        <p className={KPI_VALUE}>{pcs(k.finishedLots)}</p>
        <p className={KPI_SUB}>{pcs(k.finishedPcs)} ready pieces into stock</p>
      </div>
    </div>
  );
}

const TAB_ITEMS = [
  { id: "lots", label: "Lots" },
  { id: "pending", label: "Pending with workers" },
  { id: "stages", label: "Stages" },
  { id: "designs", label: "Design cards" },
  { id: "fabric", label: "Fabric stock (MTR)" },
] as const;

const TAB_PANEL = "flex-1 min-h-0 overflow-y-auto mt-0 tab-scroll-stable data-[state=inactive]:hidden";

const Manufacturing = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const mfg = useManufacturerERP();
  const [tab, setTab] = useState("lots");
  const [lotId, setLotId] = useState<string | null>(null);
  const orgId = currentOrganization?.id;
  const openLot = (id: string) => {
    setLotId(id);
    setTab("lots");
  };

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={() => orgNavigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Factory className="h-5 w-5 shrink-0" />
                Manufacturing
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Production lots · cutting · staff and job workers · ready pieces into stock
              </p>
            </div>
          </div>
        </div>

        {!mfg.enabled || !orgId ? (
          <Card className={MFG_CARD}>
            <CardContent className="py-10 text-center space-y-2">
              <p className="font-medium">Manufacturer ERP is off for this shop</p>
              <p className="text-sm text-muted-foreground">Turn it on in Settings &gt; Product &gt; Manufacturer ERP.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ManufacturingKpis orgId={orgId} />
            <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0 gap-2">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
                {TAB_ITEMS.map(({ id, label }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      "h-9 px-4 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
                      "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
                    )}
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="lots" className={TAB_PANEL}>
                <LotsTab orgId={orgId} endBitsDefault={mfg.end_bits_default} allowedWastage={mfg.allowed_wastage_percent}
                  selectedLotId={lotId} onSelectLot={setLotId} />
              </TabsContent>
              <TabsContent value="pending" className={TAB_PANEL}>
                <PendingWorkTab orgId={orgId} onOpenLot={openLot} />
              </TabsContent>
              <TabsContent value="stages" className={TAB_PANEL}>
                <StagesTab orgId={orgId} />
              </TabsContent>
              <TabsContent value="designs" className={TAB_PANEL}>
                <DesignsTab orgId={orgId} allowedWastage={mfg.allowed_wastage_percent} />
              </TabsContent>
              <TabsContent value="fabric" className={TAB_PANEL}>
                <FabricStockTab orgId={orgId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

export default Manufacturing;
