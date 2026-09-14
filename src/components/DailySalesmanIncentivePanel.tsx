import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_NEUTRAL_TH,
  INSIGHTS_TABLE_HEAD,
} from "@/components/business-insights/insightsLayout";
import { cn } from "@/lib/utils";
import { isDailyIncentiveUiOrg } from "@/utils/dailySalesmanIncentive";
import {
  fetchDailyIncentiveConfig,
  loadOrComputeDailyIncentiveDays,
} from "@/utils/dailySalesmanIncentiveSync";

const fmtInr = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function DailySalesmanIncentivePanel({
  rangeStart,
  rangeEnd,
}: {
  /** Shared page date filter (IST yyyy-MM-dd). */
  rangeStart: string;
  rangeEnd: string;
}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const startYmd = rangeStart;
  const endYmd = rangeEnd;
  const [filterSalesman, setFilterSalesman] = useState("all");

  const uiEnabled = isDailyIncentiveUiOrg(orgId);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["daily-salesman-incentive-config", orgId],
    queryFn: () => fetchDailyIncentiveConfig(orgId!),
    enabled: !!orgId && uiEnabled,
  });

  const {
    data: rows = [],
    isLoading: rowsLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["daily-salesman-incentive-days", orgId, startYmd, endYmd],
    queryFn: () =>
      loadOrComputeDailyIncentiveDays({
        organizationId: orgId!,
        startYmd,
        endYmd,
      }),
    enabled: !!orgId && uiEnabled && !!config && !!startYmd && !!endYmd,
  });

  const salesmanNames = useMemo(
    () => [...new Set(rows.map((r) => r.employee_name))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    if (filterSalesman === "all") return rows;
    return rows.filter((r) => r.employee_name === filterSalesman);
  }, [rows, filterSalesman]);

  const summary = useMemo(() => {
    const map = new Map<
      string,
      { name: string; days: number; qty: number; net: number; incentive: number; eligibleDays: number }
    >();
    for (const r of filtered) {
      const cur = map.get(r.employee_name) || {
        name: r.employee_name,
        days: 0,
        qty: 0,
        net: 0,
        incentive: 0,
        eligibleDays: 0,
      };
      cur.days += 1;
      cur.qty += r.total_qty;
      cur.net += r.total_net_amount;
      cur.incentive += r.incentive_amount;
      if (r.is_eligible) cur.eligibleDays += 1;
      map.set(r.employee_name, cur);
    }
    return [...map.values()].sort((a, b) => b.incentive - a.incentive);
  }, [filtered]);

  const totalIncentive = filtered.reduce((s, r) => s + r.incentive_amount, 0);

  if (!uiEnabled) return null;

  if (configLoading) {
    return <ListTableSkeleton rows={6} columns={6} />;
  }

  if (!config) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Daily incentive is not enabled for this organization.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex flex-wrap items-end gap-3 shrink-0">
        <div className="space-y-1">
          <Label className="text-xs">Salesman</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={filterSalesman}
            onChange={(e) => setFilterSalesman(e.target.value)}
          >
            <option value="all">All</option>
            {salesmanNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-slate-50"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
        <p className="text-xs text-muted-foreground pb-2 max-w-xl">
          Uses page date filter ({startYmd === endYmd ? startYmd : `${startYmd} → ${endYmd}`}). Qty ≥{" "}
          {config.qty_threshold} required. Net brackets:{" "}
          {config.brackets
            .slice()
            .sort(
              (a, b) =>
                (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.min_net_amount - b.min_net_amount,
            )
            .map((b) => {
              const min = Number(b.min_net_amount);
              const max = b.max_net_amount == null ? null : Number(b.max_net_amount);
              const range =
                max == null
                  ? `≥₹${min.toLocaleString("en-IN")}`
                  : `₹${min.toLocaleString("en-IN")}–${(max - 0.01).toLocaleString("en-IN")}`;
              return `${range}→₹${Number(b.incentive_amount)}`;
            })
            .join(" · ")}
          . Past IST days lock after first compute (later returns do not reverse).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Incentive total</div>
          <div className="text-lg font-semibold tabular-nums">{fmtInr(totalIncentive)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Day-rows</div>
          <div className="text-lg font-semibold tabular-nums">{filtered.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Eligible day-rows</div>
          <div className="text-lg font-semibold tabular-nums">
            {filtered.filter((r) => r.is_eligible).length}
          </div>
        </Card>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {(error as Error).message || "Failed to load daily incentive"}
        </p>
      ) : null}

      <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex flex-col min-h-[180px]">
        <div className="px-3 py-2 border-b border-slate-100 bg-white shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Salesman summary</h2>
        </div>
        {rowsLoading ? (
          <div className="p-2">
            <ListTableSkeleton rows={6} columns={6} />
          </div>
        ) : summary.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No salesman sales in this range (blank salesman excluded)
          </p>
        ) : (
          <div className="overflow-auto bg-white max-h-[240px]">
            <Table>
              <TableHeader className={INSIGHTS_TABLE_HEAD}>
                <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                  <TableHead className={INSIGHTS_NEUTRAL_TH}>Salesman</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Days</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Eligible</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Qty</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Net sale</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Incentive</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s) => (
                  <TableRow key={s.name} className={INSIGHTS_BODY_ROW}>
                    <TableCell className={INSIGHTS_BODY_CELL}>{s.name}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{s.days}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{s.eligibleDays}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{s.qty}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{fmtInr(s.net)}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{fmtInr(s.incentive)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex flex-col flex-1 min-h-[220px]">
        <div className="px-3 py-2 border-b border-slate-100 bg-white shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Daily detail</h2>
        </div>
        {rowsLoading ? (
          <div className="p-2">
            <ListTableSkeleton rows={8} columns={7} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No daily rows</p>
        ) : (
          <div className="overflow-auto bg-white flex-1 min-h-0">
            <Table>
              <TableHeader className={INSIGHTS_TABLE_HEAD}>
                <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                  <TableHead className={INSIGHTS_NEUTRAL_TH}>Date</TableHead>
                  <TableHead className={INSIGHTS_NEUTRAL_TH}>Salesman</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Qty</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Net</TableHead>
                  <TableHead className={INSIGHTS_NEUTRAL_TH}>Eligible</TableHead>
                  <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Incentive</TableHead>
                  <TableHead className={INSIGHTS_NEUTRAL_TH}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={`${r.incentive_date}-${r.employee_name}`}
                    className={INSIGHTS_BODY_ROW}
                  >
                    <TableCell className={INSIGHTS_BODY_CELL}>{r.incentive_date}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>{r.employee_name}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{r.total_qty}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      {fmtInr(r.total_net_amount)}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      {r.is_eligible ? (
                        <Badge variant="default">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      {fmtInr(r.incentive_amount)}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      {r.is_locked ? (
                        <Badge variant="outline">Locked</Badge>
                      ) : (
                        <Badge variant="secondary">Live</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
