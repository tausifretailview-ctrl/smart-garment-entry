import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Printer, RotateCcw, Search } from "lucide-react";
import { ErpDashboardKpiCard } from "@/components/dashboard/ErpDashboardKpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  fetchZeroRunForSession,
  reverseUnscannedStockSettlement,
  scannedVariantIdsForSession,
  zeroUnscannedStockSettlement,
  type StockSettlementScanRow,
  type StockSettlementZeroRun,
} from "@/utils/stockSettlementScans";

export interface WriteOffProductRow {
  variantId: string;
  id: string;
  name: string;
  barcode?: string;
  department: string;
  brand: string;
  softwareStock: number;
  purPrice: number;
}

export interface SettledSessionOption {
  sessionId: string;
  label: string;
  date: string;
  totalItems: number;
}

interface StockSettlementWriteOffTabProps {
  organizationId: string;
  products: WriteOffProductRow[];
  scanLogRows: StockSettlementScanRow[];
  settledSessions: SettledSessionOption[];
  canWriteOff: boolean;
  onStockMutated: () => void | Promise<void>;
}

function formatInr(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export default function StockSettlementWriteOffTab({
  organizationId,
  products,
  scanLogRows,
  settledSessions,
  canWriteOff,
  onStockMutated,
}: StockSettlementWriteOffTabProps) {
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [activeRun, setActiveRun] = useState<StockSettlementZeroRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmToken, setConfirmToken] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    if (!sessionId && settledSessions.length > 0) {
      setSessionId(settledSessions[0].sessionId);
    }
  }, [settledSessions, sessionId]);

  useEffect(() => {
    setExcluded(new Set());
    setPage(1);
    setSearch("");
  }, [sessionId]);

  useEffect(() => {
    if (!organizationId || !sessionId) {
      setActiveRun(null);
      return;
    }
    let cancelled = false;
    setRunLoading(true);
    void fetchZeroRunForSession(organizationId, sessionId).then((run) => {
      if (!cancelled) {
        setActiveRun(run);
        setRunLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, sessionId]);

  const sessionScanIds = useMemo(
    () => (sessionId ? scannedVariantIdsForSession(scanLogRows, sessionId) : new Set<string>()),
    [scanLogRows, sessionId],
  );

  const sessionHasSettledScans = useMemo(() => {
    if (!sessionId) return false;
    return scanLogRows.some(
      (r) => r.settlement_session_id === sessionId && r.settled,
    );
  }, [scanLogRows, sessionId]);

  const sessionHasOpenScans = useMemo(() => {
    if (!sessionId) return false;
    return scanLogRows.some(
      (r) => r.settlement_session_id === sessionId && !r.settled,
    );
  }, [scanLogRows, sessionId]);

  const candidates = useMemo(() => {
    if (!sessionId || !sessionHasSettledScans || sessionHasOpenScans) return [];
    return products.filter(
      (p) => p.softwareStock > 0 && !sessionScanIds.has(p.variantId),
    );
  }, [products, sessionId, sessionScanIds, sessionHasSettledScans, sessionHasOpenScans]);

  const included = useMemo(
    () => candidates.filter((p) => !excluded.has(p.variantId)),
    [candidates, excluded],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return included;
    const s = search.toLowerCase();
    return included.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s) ||
        (p.barcode && p.barcode.toLowerCase().includes(s)),
    );
  }, [included, search]);

  const totals = useMemo(() => {
    const units = included.reduce((sum, p) => sum + p.softwareStock, 0);
    const cost = included.reduce((sum, p) => sum + p.softwareStock * p.purPrice, 0);
    return { variants: included.length, units, cost };
  }, [included]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const toggleExclude = useCallback((variantId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }, []);

  const handlePrint = useCallback(() => {
    const rows = included
      .map(
        (p, i) =>
          `<tr>
            <td>${i + 1}</td>
            <td>${p.barcode || "—"}</td>
            <td>${p.name.replace(/</g, "&lt;")}</td>
            <td style="text-align:right">${p.softwareStock}</td>
            <td style="text-align:right">${formatInr(p.purPrice)}</td>
            <td style="text-align:right">${formatInr(p.softwareStock * p.purPrice)}</td>
          </tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><title>Unscanned write-off</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:16px;color:#111}
        h1{font-size:16px;margin:0 0 4px}
        p{font-size:12px;margin:0 0 12px;color:#444}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
        th{background:#f5f5f5}
      </style></head><body>
      <h1>Physical Count — Unscanned Write-Off Review</h1>
      <p>Session ${sessionId.slice(0, 8).toUpperCase()} · ${totals.variants} variants · ${totals.units} units · ₹${formatInr(totals.cost)}</p>
      <table><thead><tr><th>#</th><th>Barcode</th><th>Product</th><th>Qty</th><th>Cost</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) {
      toast({ title: "Print blocked", description: "Allow pop-ups to print this list", variant: "destructive" });
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [included, sessionId, totals, toast]);

  const handleWriteOff = useCallback(async () => {
    if (!canWriteOff || !sessionId || included.length === 0) return;
    if (confirmToken.trim().toUpperCase() !== "ZERO") {
      toast({ title: "Type ZERO to confirm", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await zeroUnscannedStockSettlement({
        organizationId,
        sessionId,
        excludeVariantIds: [...excluded],
        expectedCount: included.length,
        note,
      });
      setShowConfirm(false);
      setConfirmToken("");
      setNote("");
      await onStockMutated();
      const run = await fetchZeroRunForSession(organizationId, sessionId);
      setActiveRun(run);
      toast({
        title: result.already_applied ? "Already written off" : "Unscanned stock written off",
        description: `${result.variant_count} variants · ${result.total_units} units · ₹${formatInr(Number(result.cost_value))}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Write-off failed", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [
    canWriteOff,
    sessionId,
    included.length,
    confirmToken,
    organizationId,
    excluded,
    note,
    onStockMutated,
    toast,
  ]);

  const handleReverse = useCallback(async () => {
    if (!canWriteOff || !activeRun) return;
    setReversing(true);
    try {
      const result = await reverseUnscannedStockSettlement(organizationId, activeRun.id);
      await onStockMutated();
      setActiveRun(null);
      toast({
        title: result.already_reversed ? "Already reversed" : "Write-off reversed",
        description: result.already_reversed
          ? "This run was already reversed"
          : `Restored ${result.restored_count} variants`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Reverse failed", description: msg, variant: "destructive" });
    } finally {
      setReversing(false);
    }
  }, [canWriteOff, activeRun, organizationId, onStockMutated, toast]);

  if (settledSessions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        <div>
          <h2 className="text-base font-bold text-slate-800">Write Off Unscanned</h2>
          <p className="text-sm text-slate-500">
            Settle scanned items first, then review variants still showing stock that were never scanned.
          </p>
        </div>
        <Card className="border-amber-200 bg-amber-50/60 p-6 text-sm text-amber-900 shadow-sm">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              No settled physical-count session yet. Complete a scan and use{" "}
              <span className="font-semibold">Settlement</span> first. This action never runs automatically.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800">Write Off Unscanned</h2>
          <p className="text-sm text-slate-500">
            Set software stock to 0 for variants not found in the physical count — not via POS sales.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="h-9 w-[220px] bg-white text-xs">
              <SelectValue placeholder="Select settled session" />
            </SelectTrigger>
            <SelectContent>
              {settledSessions.map((s) => (
                <SelectItem key={s.sessionId} value={s.sessionId}>
                  {s.label} · {s.date} · {s.totalItems} scanned
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={handlePrint}
            disabled={included.length === 0}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      {!canWriteOff && (
        <Card className="border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 shadow-sm">
          Viewing only — admin or manager role is required to write off or reverse.
        </Card>
      )}

      {sessionHasOpenScans && (
        <Card className="border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 shadow-sm">
          This session still has open scans. Finish Settlement before writing off unscanned stock.
        </Card>
      )}

      {runLoading ? (
        <div className="flex items-center gap-2 py-8 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking prior write-off…
        </div>
      ) : activeRun ? (
        <Card className="border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Written off</Badge>
                <span className="text-sm text-slate-600">
                  {activeRun.variant_count} variants · {activeRun.total_units} units · ₹
                  {formatInr(Number(activeRun.cost_value))}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(activeRun.created_at).toLocaleString("en-IN")}
                {activeRun.note ? ` · ${activeRun.note}` : ""}
              </p>
            </div>
            {canWriteOff && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
                onClick={() => void handleReverse()}
                disabled={reversing}
              >
                {reversing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Reverse write-off
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ErpDashboardKpiCard
              title="Variants"
              value={totals.variants.toLocaleString("en-IN")}
              shellClass="bg-red-50 border-red-200/70"
              valueClass="text-red-800"
            />
            <ErpDashboardKpiCard
              title="Units"
              value={totals.units.toLocaleString("en-IN")}
              shellClass="bg-amber-50 border-amber-200/70"
              valueClass="text-amber-800"
            />
            <ErpDashboardKpiCard
              title="Cost value"
              value={`₹${formatInr(totals.cost)}`}
              shellClass="bg-slate-50 border-slate-200"
              valueClass="text-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product / barcode…"
                className="h-9 bg-white pl-8 text-sm no-uppercase"
              />
            </div>
            {excluded.size > 0 && (
              <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setExcluded(new Set())}>
                Clear {excluded.size} excluded
              </Button>
            )}
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              disabled={!canWriteOff || included.length === 0 || sessionHasOpenScans}
              onClick={() => {
                setConfirmToken("");
                setShowConfirm(true);
              }}
            >
              Write off {included.length.toLocaleString("en-IN")}…
            </Button>
          </div>

          <Card className="min-h-0 flex-1 overflow-hidden border-slate-200 shadow-sm">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                {candidates.length === 0
                  ? "No unscanned stock for this session"
                  : "All candidates excluded or filtered out"}
              </div>
            ) : (
              <div className="overflow-auto">
                <Table className="w-full [&_td]:!text-xs [&_th]:!text-[10px] [&_th]:uppercase">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      {["Barcode", "Product", "Dept", "System qty", "Cost", "Value", ""].map((h) => (
                        <TableHead key={h || "act"} className="text-slate-500">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((p) => (
                      <TableRow key={p.variantId}>
                        <TableCell className="font-mono tabular-nums">{p.barcode || "—"}</TableCell>
                        <TableCell className="text-slate-700">{p.name}</TableCell>
                        <TableCell>{p.department}</TableCell>
                        <TableCell className="font-mono font-semibold tabular-nums text-red-700">
                          {p.softwareStock}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">₹{formatInr(p.purPrice)}</TableCell>
                        <TableCell className="font-mono tabular-nums">
                          ₹{formatInr(p.softwareStock * p.purPrice)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-slate-600"
                            onClick={() => toggleExclude(p.variantId)}
                          >
                            Exclude
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {filtered.length > pageSize && (
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                <span>
                  Page {page} / {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm unscanned write-off</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              You are about to set stock to <b>0</b> for{" "}
              <span className="font-mono font-bold tabular-nums text-red-700">{totals.variants}</span>{" "}
              variants (
              <span className="font-mono font-bold tabular-nums">{totals.units}</span> units, ₹
              <span className="font-mono font-bold tabular-nums">{formatInr(totals.cost)}</span>
              ).
            </p>
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              This does not create sales. It writes reconciliation stock movements and can be reversed from this tab.
            </p>
            <div>
              <Label htmlFor="zero-note" className="text-xs text-slate-500">
                Note (optional)
              </Label>
              <Textarea
                id="zero-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for write-off…"
                className="mt-1 min-h-[56px] resize-y text-sm no-uppercase"
              />
            </div>
            <div>
              <Label htmlFor="zero-confirm" className="text-xs text-slate-500">
                Type <span className="font-mono font-semibold">ZERO</span> to confirm
              </Label>
              <Input
                id="zero-confirm"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                placeholder="ZERO"
                className="mt-1 font-mono no-uppercase"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              className={cn("gap-1.5 bg-red-600 hover:bg-red-700")}
              disabled={submitting || confirmToken.trim().toUpperCase() !== "ZERO"}
              onClick={() => void handleWriteOff()}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Write off stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
