import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useManufacturerERP } from "@/hooks/useManufacturerERP";
import { BackToDashboard } from "@/components/BackToDashboard";
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
import { ArrowDown, ArrowUp, Factory, Pencil, Plus, Trash2 } from "lucide-react";
import {
  computeDesignStandardCost,
  DEFAULT_MFG_STAGES,
  MFG_WORK_TYPE_LABEL,
  piecesFromMeters,
  type MfgWorkType,
} from "@/utils/manufacturing";

// New mfg_* tables are not in the generated Supabase types yet.
const db = supabase as any;

interface MfgStage {
  id: string;
  name: string;
  sequence: number;
  work_type: MfgWorkType;
  default_rate: number;
  allowed_days: number | null;
  allowed_wastage_percent: number | null;
  notes: string | null;
  active: boolean;
}

interface MfgProduct {
  id: string;
  product_name: string;
  uom: string;
  default_pur_price: number | null;
}

interface MfgDesignMaterial {
  material_product_id: string;
  material_type: "fabric" | "trim";
  qty_per_piece: number;
  wastage_percent: number;
}

interface MfgDesign {
  id: string;
  design_no: string;
  design_name: string | null;
  finished_product_id: string | null;
  overhead_per_piece: number;
  notes: string | null;
  active: boolean;
  materials: MfgDesignMaterial[];
  stage_rates: { stage_id: string; rate: number }[];
}

interface FabricStockRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  color: string | null;
  barcode: string | null;
  is_roll: boolean;
  roll_meters: number | null;
  rolls_in_stock: number | null;
  meters_purchased_in_stock: number;
  meters_used: number;
  meters_left: number;
  pur_price: number;
  stock_value: number;
}

const inr = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mtr = (n: number) => `${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} m`;
const isMtr = (p: MfgProduct | undefined) => (p?.uom || "").toUpperCase() === "MTR";

const stagesKey = (orgId?: string) => ["mfg-stages", orgId];
const designsKey = (orgId?: string) => ["mfg-designs", orgId];

function useMfgStages(orgId?: string) {
  return useQuery({
    queryKey: stagesKey(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<MfgStage[]> => {
      const { data, error } = await db
        .from("mfg_stages")
        .select("id, name, sequence, work_type, default_rate, allowed_days, allowed_wastage_percent, notes, active")
        .eq("organization_id", orgId)
        .order("sequence", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as MfgStage[];
    },
  });
}

/** Products for the design card pickers (fabric = MTR products, trims and finished goods = the rest). */
function useMfgProducts(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["mfg-products", orgId],
    enabled: !!orgId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MfgProduct[]> => {
      const pageSize = 1000;
      const all: MfgProduct[] = [];
      for (let page = 0; page < 10; page++) {
        const { data, error } = await supabase
          .from("products")
          .select("id, product_name, uom, default_pur_price")
          .eq("organization_id", orgId as string)
          .is("deleted_at", null)
          .order("product_name", { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        all.push(...((data || []) as MfgProduct[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },
  });
}

// ─────────────────────────────── Stages ───────────────────────────────

const emptyStageForm = {
  name: "",
  work_type: "both" as MfgWorkType,
  default_rate: "",
  allowed_days: "",
  allowed_wastage_percent: "",
  notes: "",
  active: true,
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
    });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">Process stages</CardTitle>
          <CardDescription>
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
      <CardContent>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Done by</TableHead>
                  <TableHead className="text-right">Rate / pc</TableHead>
                  <TableHead className="text-right">Allowed days</TableHead>
                  <TableHead className="text-right">Allowed wastage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((s, i) => (
                  <TableRow key={s.id} className={s.active ? "" : "opacity-60"}>
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {s.name}
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

  const { data: designs = [], isLoading } = useQuery({
    queryKey: designsKey(orgId),
    queryFn: async (): Promise<MfgDesign[]> => {
      const { data, error } = await db
        .from("mfg_designs")
        .select(
          "id, design_no, design_name, finished_product_id, overhead_per_piece, notes, active, " +
            "materials:mfg_design_materials(material_product_id, material_type, qty_per_piece, wastage_percent, sort_order), " +
            "stage_rates:mfg_design_stage_rates(stage_id, rate)",
        )
        .eq("organization_id", orgId)
        .order("design_no", { ascending: true });
      if (error) throw error;
      return ((data || []) as MfgDesign[]).map((d) => ({
        ...d,
        materials: [...(d.materials || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        stage_rates: d.stage_rates || [],
      }));
    },
  });

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
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">Design cards</CardTitle>
          <CardDescription>
            What one piece needs: fabric metres, buttons and trims, and the rate paid at each stage. Every lot is checked against this.
          </CardDescription>
        </div>
        <Button onClick={openNew} disabled={activeStages.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> New design card
        </Button>
      </CardHeader>
      <CardContent>
        {activeStages.length === 0 && (
          <p className="text-sm text-amber-700 mb-3">Add your stages first, in the Stages tab.</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading design cards…</p>
        ) : designs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No design cards yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Design</TableHead>
                  <TableHead>Finished product</TableHead>
                  <TableHead className="text-right">Fabric / pc</TableHead>
                  <TableHead className="text-right">Fabric ₹</TableHead>
                  <TableHead className="text-right">Trims ₹</TableHead>
                  <TableHead className="text-right">Labour ₹</TableHead>
                  <TableHead className="text-right">Cost / pc</TableHead>
                  <TableHead className="text-right">Can make now</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {designs.map((d) => {
                  const c = designCost(d);
                  const pcs = piecesPossible(d);
                  return (
                    <TableRow key={d.id} className={d.active ? "" : "opacity-60"}>
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
                      <TableCell className="text-right tabular-nums">{pcs == null ? "—" : `${pcs} pcs`}</TableCell>
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

function useFabricStock(orgId: string) {
  return useQuery({
    queryKey: ["mfg-fabric-stock", orgId],
    staleTime: 60_000,
    queryFn: async (): Promise<FabricStockRow[]> => {
      const { data, error } = await db.rpc("get_mfg_fabric_stock", { p_organization_id: orgId });
      if (error) throw error;
      return (data || []) as FabricStockRow[];
    },
  });
}

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
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">Fabric stock in metres</CardTitle>
          <CardDescription>
            Every roll bought in MTR, with metres left after fabric issued to production.
          </CardDescription>
        </div>
        <Input className="w-full sm:w-64" placeholder="Search fabric, colour, barcode" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search fabric stock" />
      </CardHeader>
      <CardContent className="space-y-3">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fabric</TableHead>
                  <TableHead>Colour</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">Roll length</TableHead>
                  <TableHead className="text-right">Bought (in stock)</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  <TableHead className="text-right">Rate / m</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.variant_id}>
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

const Manufacturing = () => {
  const { currentOrganization } = useOrganization();
  const mfg = useManufacturerERP();
  const [tab, setTab] = useState("stages");
  const orgId = currentOrganization?.id;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-slate-50 px-2 py-2 sm:px-3">
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="space-y-1">
          <div className="[&_button]:mb-0">
            <BackToDashboard />
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold leading-none tracking-tight text-blue-700">
            <Factory className="h-6 w-6" /> Manufacturing
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up your process stages and design cards, and see fabric stock in metres.
          </p>
        </div>

        {!mfg.enabled || !orgId ? (
          <Card>
            <CardContent className="py-10 text-center space-y-2">
              <p className="font-medium">Manufacturer ERP is off for this shop</p>
              <p className="text-sm text-muted-foreground">Turn it on in Settings &gt; Product &gt; Manufacturer ERP.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="stages">Stages</TabsTrigger>
              <TabsTrigger value="designs">Design cards</TabsTrigger>
              <TabsTrigger value="fabric">Fabric stock (MTR)</TabsTrigger>
            </TabsList>
            <TabsContent value="stages" className="mt-3">
              <StagesTab orgId={orgId} />
            </TabsContent>
            <TabsContent value="designs" className="mt-3">
              <DesignsTab orgId={orgId} allowedWastage={mfg.allowed_wastage_percent} />
            </TabsContent>
            <TabsContent value="fabric" className="mt-3">
              <FabricStockTab orgId={orgId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Manufacturing;
