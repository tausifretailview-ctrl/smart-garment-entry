import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import type { MfgEndBitsDefault, MfgLotStatus } from "@/utils/manufacturing";
import {
  db,
  errMsg,
  isMtr,
  lotsKey,
  MFG_CARD,
  MFG_CARD_TITLE,
  MFG_HEAD_ROW,
  MFG_ROW,
  MFG_TABLE,
  MFG_TH,
  MFG_THEAD,
  pcs,
  useMfgDesigns,
  useMfgLots,
  useMfgProducts,
  useMfgStages,
} from "./mfgData";
import { LotDetail, LotStatusBadge } from "./LotDetail";

interface VariantRow {
  id: string;
  size: string | null;
  color: string | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function NewLotDialog({
  orgId,
  open,
  onOpenChange,
  endBitsDefault,
  onCreated,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endBitsDefault: MfgEndBitsDefault;
  onCreated: (lotId: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: designs = [] } = useMfgDesigns(orgId);
  const { data: products = [] } = useMfgProducts(orgId);
  const { data: stages = [] } = useMfgStages(orgId);
  const processStages = useMemo(() => stages.filter((s) => s.active && !s.is_cutting), [stages]);

  const [designId, setDesignId] = useState("");
  const [productId, setProductId] = useState("");
  const [lotDate, setLotDate] = useState(todayIso());
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [endBits, setEndBits] = useState<MfgEndBitsDefault>(endBitsDefault);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDesignId("");
    setProductId("");
    setLotDate(todayIso());
    setEndBits(endBitsDefault);
    setNotes("");
    setQty({});
  }, [open, endBitsDefault]);

  useEffect(() => {
    if (open) setStageIds(processStages.map((s) => s.id));
  }, [open, processStages]);

  const { data: variants = [], isLoading: variantsLoading } = useQuery({
    queryKey: ["mfg-lot-variants", productId],
    enabled: !!productId,
    queryFn: async (): Promise<VariantRow[]> => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color")
        .eq("product_id", productId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as VariantRow[];
    },
  });

  // Colour rows × size columns, in the order the variants were created (size group order).
  const grid = useMemo(() => {
    const sizes: string[] = [];
    const colors: string[] = [];
    const byKey = new Map<string, VariantRow>();
    for (const v of variants) {
      const size = v.size || "—";
      const color = v.color || "—";
      if (!sizes.includes(size)) sizes.push(size);
      if (!colors.includes(color)) colors.push(color);
      byKey.set(`${color}|${size}`, v);
    }
    return { sizes, colors, byKey };
  }, [variants]);

  const total = Object.values(qty).reduce<number>((s, v) => s + (Number(v) || 0), 0);

  const create = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Pick the finished product");
      const sizes = Object.entries(qty)
        .map(([variant_id, v]) => ({ variant_id, planned_qty: Number(v) || 0 }))
        .filter((r) => r.planned_qty > 0);
      if (sizes.length === 0) throw new Error("Enter pieces to make for at least one size");
      const { data, error } = await db.rpc("mfg_create_lot", {
        p_organization_id: orgId,
        p_finished_product_id: productId,
        p_design_id: designId || null,
        p_lot_date: lotDate || todayIso(),
        p_stage_ids: processStages.filter((s) => stageIds.includes(s.id)).map((s) => s.id),
        p_end_bits_action: endBits,
        p_sale_order_id: null,
        p_notes: notes,
        p_sizes: sizes,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (lotId) => {
      void queryClient.invalidateQueries({ queryKey: lotsKey(orgId) });
      toast({ title: "Lot created", description: "Next: issue fabric and save cutting." });
      onOpenChange(false);
      onCreated(lotId);
    },
    onError: (e) => toast({ title: "Could not create lot", description: errMsg(e), variant: "destructive" }),
  });

  const designOptions = useMemo(
    () => designs.filter((d) => d.active).map((d) => ({ value: d.id, label: d.design_name ? `${d.design_no} · ${d.design_name}` : d.design_no })),
    [designs],
  );
  const productOptions = useMemo(
    () => products.filter((p) => !isMtr(p)).map((p) => ({ value: p.id, label: p.product_name })),
    [products],
  );

  const pickDesign = (id: string) => {
    setDesignId(id);
    const d = designs.find((x) => x.id === id);
    if (d?.finished_product_id && d.finished_product_id !== productId) {
      setProductId(d.finished_product_id);
      setQty({});
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New production lot</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Design card</Label>
              <SearchableSelect value={designId} onValueChange={pickDesign} options={designOptions}
                allValue="" allLabel="No design card" triggerClassName="h-10" />
            </div>
            <div className="space-y-1">
              <Label>Finished product</Label>
              <SearchableSelect value={productId} onValueChange={(v) => { setProductId(v); setQty({}); }}
                options={productOptions} allValue="" allLabel="Pick product" triggerClassName="h-10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mfg_lot_date">Lot date</Label>
              <Input id="mfg_lot_date" type="date" value={lotDate} onChange={(e) => setLotDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Pieces to make</Label>
            {!productId ? (
              <p className="text-sm text-muted-foreground">Pick the finished product to see its sizes and colours.</p>
            ) : variantsLoading ? (
              <p className="text-sm text-muted-foreground">Loading sizes…</p>
            ) : variants.length === 0 ? (
              <p className="text-sm text-amber-700">This product has no sizes or colours yet. Add them in Product Entry first.</p>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <table className="text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs font-bold uppercase tracking-wide">
                      <th className="px-2 py-2 text-left">Colour \ Size</th>
                      {grid.sizes.map((s) => (
                        <th key={s} className="px-2 py-2 text-center min-w-[72px]">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.colors.map((c) => (
                      <tr key={c} className="border-t border-slate-100 even:bg-slate-50/80">
                        <td className="px-2 py-1 font-medium whitespace-nowrap">{c}</td>
                        {grid.sizes.map((s) => {
                          const v = grid.byKey.get(`${c}|${s}`);
                          return (
                            <td key={s} className="px-1 py-1">
                              {v ? (
                                <Input type="number" min={0} step="1" className="h-8 w-[72px] text-center tabular-nums"
                                  aria-label={`${c} ${s} pieces`} value={qty[v.id] ?? ""}
                                  onChange={(e) => setQty({ ...qty, [v.id]: e.target.value })} />
                              ) : (
                                <span className="block text-center text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {total > 0 && <p className="text-sm font-medium tabular-nums">Total: {pcs(total)} pcs</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-base">Stages for this lot</Label>
            {processStages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stages after cutting. Pieces go straight to stock after cutting.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {processStages.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 cursor-pointer">
                    <Checkbox checked={stageIds.includes(s.id)}
                      onCheckedChange={(v) => setStageIds(v ? [...stageIds, s.id] : stageIds.filter((x) => x !== s.id))} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Leftover fabric after cutting</Label>
              <Select value={endBits} onValueChange={(v) => setEndBits(v as MfgEndBitsDefault)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wastage">Count as wastage</SelectItem>
                  <SelectItem value="stock">Put back in stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mfg_lot_notes">Notes</Label>
              <Input id="mfg_lot_notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || total <= 0}>Create lot</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LotsTab({
  orgId,
  endBitsDefault,
  allowedWastage,
  selectedLotId,
  onSelectLot,
}: {
  orgId: string;
  endBitsDefault: MfgEndBitsDefault;
  allowedWastage: number;
  selectedLotId: string | null;
  onSelectLot: (id: string | null) => void;
}) {
  const { data: lots = [], isLoading } = useMfgLots(orgId);
  const [newOpen, setNewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | MfgLotStatus | "all">("active");

  const filtered = useMemo(
    () =>
      lots.filter((l) =>
        statusFilter === "all" ? true : statusFilter === "active" ? l.status === "open" || l.status === "cut" : l.status === statusFilter,
      ),
    [lots, statusFilter],
  );

  if (selectedLotId) {
    return (
      <LotDetail key={selectedLotId} orgId={orgId} lotId={selectedLotId} allowedWastage={allowedWastage} onBack={() => onSelectLot(null)} />
    );
  }

  const sum = (l: (typeof lots)[number], k: "planned_qty" | "cut_qty" | "finished_qty") =>
    l.sizes.reduce((s, x) => s + (Number(x[k]) || 0), 0);

  return (
    <Card className={MFG_CARD}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-slate-100 px-4 py-3">
        <div className="space-y-1">
          <CardTitle className={MFG_CARD_TITLE}>Production lots</CardTitle>
          <CardDescription className="text-xs">One lot = one batch of a design, from fabric issue to ready pieces in stock.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Running lots</SelectItem>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="all">All lots</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New lot
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading lots…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {lots.length === 0 ? "No lots yet. Click New lot to start one." : "No lots in this view."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className={MFG_TABLE}>
              <TableHeader className={MFG_THEAD}>
                <TableRow className={MFG_HEAD_ROW}>
                  <TableHead className={MFG_TH}>Lot</TableHead>
                  <TableHead className={MFG_TH}>Date</TableHead>
                  <TableHead className={MFG_TH}>Product</TableHead>
                  <TableHead className={MFG_TH}>Design</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Planned</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>Cut</TableHead>
                  <TableHead className={cn(MFG_TH, "text-right")}>In stock</TableHead>
                  <TableHead className={MFG_TH}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id} className={cn(MFG_ROW, "cursor-pointer")} onClick={() => onSelectLot(l.id)}>
                    <TableCell className="font-medium text-blue-700">{l.lot_no}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(l.lot_date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell>{l.product?.product_name || "—"}</TableCell>
                    <TableCell>{l.design?.design_no || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pcs(sum(l, "planned_qty"))}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.status === "open" ? "—" : pcs(sum(l, "cut_qty"))}</TableCell>
                    <TableCell className="text-right tabular-nums">{pcs(sum(l, "finished_qty"))}</TableCell>
                    <TableCell><LotStatusBadge status={l.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <NewLotDialog orgId={orgId} open={newOpen} onOpenChange={setNewOpen} endBitsDefault={endBitsDefault}
        onCreated={(id) => onSelectLot(id)} />
    </Card>
  );
}
