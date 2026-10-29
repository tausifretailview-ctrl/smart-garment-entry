import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock } from "lucide-react";
import { jobCardRemaining } from "@/utils/manufacturing";
import { CloseShortDialog, ReceiveDialog } from "./LotDetail";
import {
  errMsg,
  lotsKey,
  openJobCardsKey,
  pcs,
  useMfgStages,
  useOpenJobCards,
  type MfgJobCard,
} from "./mfgData";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysOut(sentDate: string) {
  const start = new Date(`${sentDate}T00:00:00`).getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.max(Math.round((today - start) / DAY_MS), 0);
}

/** Pieces still with staff and job workers, oldest first, with late cards marked. */
export function PendingWorkTab({ orgId, onOpenLot }: { orgId: string; onOpenLot: (lotId: string) => void }) {
  const queryClient = useQueryClient();
  const { data: cards = [], isLoading, error } = useOpenJobCards(orgId);
  const { data: stages = [] } = useMfgStages(orgId);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const [search, setSearch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [receiveCard, setReceiveCard] = useState<MfgJobCard | null>(null);
  const [shortCard, setShortCard] = useState<MfgJobCard | null>(null);

  const rows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return cards
      .filter((c) => c.lot?.status === "cut")
      .map((c) => {
        const stage = stageById.get(c.stage_id);
        const days = daysOut(c.sent_date);
        const late = c.due_date ? c.due_date < today : stage?.allowed_days != null && days > stage.allowed_days;
        return { card: c, stageName: stage?.name || "—", allowedDays: stage?.allowed_days ?? null, days, late, pending: jobCardRemaining(c) };
      });
  }, [cards, stageById]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!lateOnly || r.late) &&
      (!q ||
        r.card.worker_name.toLowerCase().includes(q) ||
        (r.card.lot?.lot_no || "").toLowerCase().includes(q) ||
        (r.card.lot?.product?.product_name || "").toLowerCase().includes(q) ||
        r.stageName.toLowerCase().includes(q)),
  );

  const byWorker = useMemo(() => {
    const m = new Map<string, { key: string; name: string; pending: number; late: number }>();
    for (const r of rows) {
      const key = `${r.card.worker_type}:${r.card.employee_id || r.card.supplier_id || r.card.worker_name}`;
      const cur = m.get(key) || { key, name: r.card.worker_name, pending: 0, late: 0 };
      cur.pending += r.pending;
      if (r.late) cur.late += r.pending;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.pending - a.pending);
  }, [rows]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: openJobCardsKey(orgId) });
    void queryClient.invalidateQueries({ queryKey: lotsKey(orgId) });
    // Every open lot screen, since the card may belong to any lot.
    void queryClient.invalidateQueries({ queryKey: ["mfg-lot-detail"] });
  };

  const totalPending = rows.reduce((s, r) => s + r.pending, 0);
  const totalLate = rows.filter((r) => r.late).reduce((s, r) => s + r.pending, 0);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" /> Pending with workers</CardTitle>
          <CardDescription>
            {pcs(totalPending)} pieces are out with staff and job workers
            {totalLate > 0 ? `, ${pcs(totalLate)} of them late.` : "."} A card is late after its due date, or after the stage's allowed days.
          </CardDescription>
        </CardHeader>
        {byWorker.length > 0 && (
          <CardContent className="flex flex-wrap gap-2">
            {byWorker.map((w) => (
              <Badge key={w.key} variant={w.late > 0 ? "destructive" : "outline"} className="tabular-nums">
                {w.name}: {pcs(w.pending)}{w.late > 0 ? ` (${pcs(w.late)} late)` : ""}
              </Badge>
            ))}
          </CardContent>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search worker, lot, product, stage" />
        <div className="flex items-center gap-2">
          <Switch id="mfg_late_only" checked={lateOnly} onCheckedChange={setLateOnly} />
          <Label htmlFor="mfg_late_only">Late only</Label>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Could not load pending work. {errMsg(error)}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {rows.length === 0 ? "No pieces are with workers right now." : "Nothing matches the filter."}
        </p>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Sent on</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Days out</TableHead>
                <TableHead className="text-right">Pending pcs</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.card.id} className={r.late ? "bg-red-50/60" : undefined}>
                  <TableCell>
                    {r.card.worker_name}
                    <span className="text-xs text-muted-foreground"> · {r.card.worker_type === "employee" ? "Staff" : "Job worker"}</span>
                  </TableCell>
                  <TableCell>
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onOpenLot(r.card.lot_id)}>
                      {r.card.lot?.lot_no || "—"}
                    </button>
                    <div className="text-xs text-muted-foreground">{r.card.lot?.product?.product_name || ""}</div>
                  </TableCell>
                  <TableCell>{r.stageName}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(r.card.sent_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.card.due_date ? new Date(r.card.due_date).toLocaleDateString("en-IN") : r.allowedDays != null ? `${r.allowedDays} days` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.days}
                    {r.late && <Badge variant="destructive" className="ml-2">Late</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{pcs(r.pending)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => setReceiveCard(r.card)}>Receive</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setShortCard(r.card)}>Close short</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ReceiveDialog orgId={orgId} card={receiveCard} stageName={receiveCard ? stageById.get(receiveCard.stage_id)?.name || "" : ""}
        onClose={() => setReceiveCard(null)} refresh={refresh} />
      <CloseShortDialog card={shortCard} onClose={() => setShortCard(null)} refresh={refresh} />
    </div>
  );
}
