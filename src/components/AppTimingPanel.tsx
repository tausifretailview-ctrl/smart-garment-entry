import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDMY } from "@/lib/dateDisplay";
import { formatTimingSeconds, isSlowTiming } from "@/lib/appTiming";

type SummaryRow = {
  organization_id: string;
  organization_name: string;
  metric: "screen_open" | "bill_save";
  screen: string;
  samples: number;
  median_ms: number;
  p95_ms: number;
  max_ms: number;
  last_at: string;
};

const METRIC_LABEL: Record<string, string> = {
  bill_save: "Bill save",
  screen_open: "Screen opening wait",
};

const DAY_OPTIONS = [1, 7, 30];

/**
 * How long shops wait, from the timings the app sends in the background
 * (record_app_timings). "95% within" = 95 of 100 tries were at or under this.
 */
export function AppTimingPanel() {
  const [days, setDays] = useState(7);
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["app_timing_summary", days],
    queryFn: async (): Promise<SummaryRow[]> => {
      const { data, error } = await supabase.rpc("get_app_timing_summary" as never, { p_days: days } as never);
      if (error) throw error;
      return ((data as unknown) || []) as SummaryRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const saves = rows.filter((r) => r.metric === "bill_save");
  const slowSaves = saves.filter((r) => isSlowTiming(r.metric, r.p95_ms));
  const opens = rows.filter((r) => r.metric === "screen_open");
  const slowOpens = opens.filter((r) => isSlowTiming(r.metric, r.p95_ms));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Period</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-md border px-3 py-1 text-sm ${d === days ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {d === 1 ? "Today" : `${d} days`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Bill saves recorded</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{saves.reduce((s, r) => s + Number(r.samples), 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Shops with slow saves (over 3 s)</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold tabular-nums ${slowSaves.length ? "text-destructive" : ""}`}>{new Set(slowSaves.map((r) => r.organization_id)).size}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Screen-opening waits recorded</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{opens.reduce((s, r) => s + Number(r.samples), 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Shops with slow opening (over 5 s)</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold tabular-nums ${slowOpens.length ? "text-destructive" : ""}`}>{new Set(slowOpens.map((r) => r.organization_id)).size}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-4 text-sm text-destructive">
              Could not load timings. If this is new, the database update for app timings may not be applied yet.
            </p>
          ) : isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No timings yet. They arrive a few minutes after shops use the app with this version.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Screen</TableHead>
                  <TableHead className="text-right">Times</TableHead>
                  <TableHead className="text-right">Typical</TableHead>
                  <TableHead className="text-right">95% within</TableHead>
                  <TableHead className="text-right">Slowest</TableHead>
                  <TableHead>Last</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.organization_id}-${r.metric}-${r.screen}`}>
                    <TableCell className="font-medium">{r.organization_name}</TableCell>
                    <TableCell>{METRIC_LABEL[r.metric] || r.metric}</TableCell>
                    <TableCell className="text-muted-foreground">{r.screen}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.samples}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTimingSeconds(r.median_ms)}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${isSlowTiming(r.metric, r.p95_ms) ? "font-semibold text-destructive" : ""}`}
                    >
                      {formatTimingSeconds(r.p95_ms)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatTimingSeconds(r.max_ms)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTimeDMY(r.last_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
