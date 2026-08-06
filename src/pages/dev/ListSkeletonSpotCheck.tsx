/**
 * DEV-only visual harness for LIST skeleton spot-checks.
 * Simulates cold-open (shell first) and retained revisit (no skeleton flash).
 * Route: /__dev__/list-skeletons
 */
import { useEffect, useState } from "react";
import { ListPageSkeleton, ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraduationCap, Search, Trash2 } from "lucide-react";

type Phase = "cold" | "loaded" | "refetch";

const SAMPLE_ROWS = [
  { id: "1", primary: "INV/25-26/1042", secondary: "Customer A" },
  { id: "2", primary: "POS/25-26/881", secondary: "Walk-in" },
  { id: "3", primary: "Soft-deleted SKU", secondary: "Blue / M" },
];

function useSimulatedQuery(delayMs: number) {
  const [phase, setPhase] = useState<Phase>("cold");
  const [paintMs, setPaintMs] = useState<number | null>(null);

  useEffect(() => {
    const t0 = performance.now();
    // First paint should already show the shell (cold).
    requestAnimationFrame(() => {
      setPaintMs(Math.round(performance.now() - t0));
    });
    const timer = window.setTimeout(() => setPhase("loaded"), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return {
    phase,
    paintMs,
    isLoading: phase === "cold",
    isFetching: phase === "refetch" || phase === "cold",
    rows: phase === "cold" ? [] : SAMPLE_ROWS,
    simulateRefetch: () => {
      setPhase("refetch");
      window.setTimeout(() => setPhase("loaded"), 800);
    },
    resetCold: () => {
      setPhase("cold");
      window.setTimeout(() => setPhase("loaded"), delayMs);
    },
  };
}

/** Recycle Bin–shaped: chrome always painted; table region skeletons on isLoading only. */
function RecycleBinPanel({ delayMs }: { delayMs: number }) {
  const q = useSimulatedQuery(delayMs);
  return (
    <div className="space-y-3" data-testid="recycle-bin-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trash2 className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Recycle Bin</h2>
            <p className="text-sm text-muted-foreground">
              Shell paints immediately; table fills after {delayMs}ms
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={q.resetCold}>
            Cold open
          </Button>
          <Button size="sm" variant="secondary" onClick={q.simulateRefetch} disabled={q.isLoading}>
            Refetch (cached)
          </Button>
        </div>
      </div>
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-3">
          <div className="relative mb-3 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search deleted…" disabled={q.isLoading} />
          </div>
          {/* Gate mirrors production: isLoading only — never isFetching */}
          {q.isLoading ? (
            <ListTableSkeleton rows={8} columns={5} className="py-2" />
          ) : (
            <div className="bg-card border border-border rounded-md min-h-[260px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Primary</TableHead>
                    <TableHead>Secondary</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.primary}</TableCell>
                      <TableCell>{r.secondary}</TableCell>
                      <TableCell>
                        {q.isFetching ? "Refreshing…" : "Deleted"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground" data-testid="recycle-meta">
        phase={q.phase} isLoading={String(q.isLoading)} isFetching={String(q.isFetching)}
        {q.paintMs != null ? ` firstPaint≈${q.paintMs}ms` : ""}
      </p>
    </div>
  );
}

/** Teacher Master–shaped: full ListPageSkeleton on org/cold gate; table skeleton when loading. */
function TeacherMasterPanel({ delayMs }: { delayMs: number }) {
  const q = useSimulatedQuery(delayMs);
  if (q.isLoading) {
    return (
      <div data-testid="teacher-cold">
        <ListPageSkeleton rows={6} columns={5} />
        <p className="text-xs text-muted-foreground px-4">
          Cold org/data gate — full list shell (Teacher Master pattern)
        </p>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-4" data-testid="teacher-loaded">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Teachers</h1>
            <p className="text-muted-foreground">Manage teaching staff</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={q.resetCold}>
          Cold open
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Teachers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-card min-h-[260px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.primary}</TableCell>
                    <TableCell>{r.secondary}</TableCell>
                    <TableCell>active</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Quotation / PO dashboard–shaped table region. */
function DashboardPanel({ title, delayMs }: { title: string; delayMs: number }) {
  const q = useSimulatedQuery(delayMs);
  return (
    <div className="space-y-3" data-testid={`dash-${title}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={q.resetCold}>
            Cold open
          </Button>
          <Button size="sm" variant="secondary" onClick={q.simulateRefetch} disabled={q.isLoading}>
            Refetch (cached)
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <ListTableSkeleton rows={8} columns={6} />
      ) : (
        <div className="bg-card border border-border rounded-md p-3 min-h-[260px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.primary}</TableCell>
                  <TableCell>{r.secondary}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {q.isFetching ? "…" : "12,450.00"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ListSkeletonSpotCheck() {
  const delayMs = (() => {
    if (typeof window === "undefined") return 1200;
    const raw = new URLSearchParams(window.location.search).get("delay");
    const n = raw ? Number(raw) : 1200;
    return Number.isFinite(n) && n >= 0 ? n : 1200;
  })();

  return (
    <div className="min-h-screen bg-background p-4 space-y-8 max-w-5xl mx-auto">
      <header className="space-y-1 border-b border-border pb-4">
        <h1 className="text-xl font-semibold">LIST skeleton spot-check (DEV)</h1>
        <p className="text-sm text-muted-foreground">
          Throttled cold-open (~{delayMs}ms, override with ?delay=): shell paints immediately
          with fixed min-height. Refetch (cached): rows stay visible — no skeleton flash
          (`isLoading`-only gate).
        </p>
      </header>

      <section className="border border-border rounded-lg p-4">
        <RecycleBinPanel delayMs={delayMs} />
      </section>

      <section className="border border-border rounded-lg overflow-hidden">
        <TeacherMasterPanel delayMs={delayMs} />
      </section>

      <section className="border border-border rounded-lg p-4">
        <DashboardPanel title="Quotation Dashboard" delayMs={delayMs} />
      </section>

      <section className="border border-border rounded-lg p-4">
        <DashboardPanel title="Sale Order Dashboard" delayMs={delayMs} />
      </section>
    </div>
  );
}
