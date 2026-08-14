import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Info } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatInsightsINR } from "@/hooks/useBusinessInsights";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
  InsightsTableSkeleton,
} from "@/components/business-insights/insightsLayout";
import { fetchCustomerSegmentIndex } from "@/utils/customerSegments";
import {
  fetchQuietCustomerContacts,
  fetchWalkInBillShare,
  splitQuietCustomers,
} from "@/utils/quietCustomers";

const DAY_PRESETS = [30, 60, 90, 180] as const;
const PAGE_SIZE = 50;

function formatDateLabel(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.slice(0, 10)), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

function daysToneClass(days: number): string {
  if (days > 365) return "text-rose-600 font-semibold";
  if (days > 90) return "text-amber-700 font-semibold";
  return "text-slate-800 font-semibold";
}

export function QuietCustomersTab() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [presetDays, setPresetDays] = useState<number | "custom">(30);
  const [customDays, setCustomDays] = useState("45");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showNever, setShowNever] = useState(false);

  const quietDays = useMemo(() => {
    if (presetDays === "custom") {
      const n = Number.parseInt(customDays, 10);
      return Number.isFinite(n) && n > 0 ? n : 30;
    }
    return presetDays;
  }, [presetDays, customDays]);

  const {
    data: segmentIndex,
    isLoading: indexLoading,
    error: indexError,
  } = useQuery({
    queryKey: ["customer-segments", orgId],
    queryFn: () => fetchCustomerSegmentIndex(orgId!),
    enabled: !!orgId,
    staleTime: STALE_LIVE,
  });

  const {
    data: walkInShare,
    isLoading: walkInLoading,
  } = useQuery({
    queryKey: ["quiet-customers-walk-in-share", orgId],
    queryFn: () => fetchWalkInBillShare(orgId!, 90),
    enabled: !!orgId,
    staleTime: STALE_LIVE,
  });

  const { dormant, neverPurchasedIds } = useMemo(() => {
    if (!segmentIndex) return { dormant: [], neverPurchasedIds: [] as string[] };
    return splitQuietCustomers(segmentIndex, quietDays);
  }, [segmentIndex, quietDays]);

  const namedCustomerCount = segmentIndex?.counts.total ?? 0;
  const lifetimeValueAtRisk = useMemo(
    () => dormant.reduce((sum, row) => sum + row.revenue, 0),
    [dormant],
  );

  const visibleDormant = useMemo(
    () => dormant.slice(0, visibleCount),
    [dormant, visibleCount],
  );

  const contactIds = useMemo(() => {
    const ids = visibleDormant.map((r) => r.customerId);
    if (showNever) ids.push(...neverPurchasedIds.slice(0, 200));
    return ids;
  }, [visibleDormant, showNever, neverPurchasedIds]);

  const { data: contacts } = useQuery({
    queryKey: ["quiet-customers-contacts", orgId, contactIds.join(",")],
    queryFn: () => fetchQuietCustomerContacts(orgId!, contactIds),
    enabled: !!orgId && contactIds.length > 0,
    staleTime: STALE_LIVE,
  });

  const asOfLabel = format(new Date(), "dd MMM yyyy");

  if (indexError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load quiet customers</p>
        <p className="mt-1 text-sm text-muted-foreground">{(indexError as Error).message}</p>
      </div>
    );
  }

  if (indexLoading || !segmentIndex) {
    return <InsightsTableSkeleton columns={5} title="Loading quiet customers…" />;
  }

  const quietPct =
    namedCustomerCount > 0 ? Math.round((dormant.length / namedCustomerCount) * 100) : 0;

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <div className="flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Quiet Customers</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            No completed bill in the last {quietDays} days — win-back call list
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden />
          As of today · {asOfLabel}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quiet for
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {DAY_PRESETS.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={presetDays === d ? "default" : "ghost"}
              className={cn(
                "h-8 px-3 text-sm",
                presetDays === d && "bg-slate-900 text-white hover:bg-slate-800",
              )}
              aria-pressed={presetDays === d}
              onClick={() => {
                setPresetDays(d);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              {d}d
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={presetDays === "custom" ? "default" : "ghost"}
            className={cn(
              "h-8 px-3 text-sm",
              presetDays === "custom" && "bg-slate-900 text-white hover:bg-slate-800",
            )}
            aria-pressed={presetDays === "custom"}
            onClick={() => {
              setPresetDays("custom");
              setVisibleCount(PAGE_SIZE);
            }}
          >
            Custom
          </Button>
        </div>
        {presetDays === "custom" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="quiet-custom-days" className="text-xs text-slate-500">
              Days
            </Label>
            <Input
              id="quiet-custom-days"
              type="number"
              min={1}
              max={3650}
              value={customDays}
              onChange={(e) => {
                setCustomDays(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-8 w-20 text-sm"
            />
          </div>
        )}
      </div>

      <Alert className="shrink-0 border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-700">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Named customers only.</strong>{" "}
          {walkInLoading || !walkInShare ? (
            <>Loading walk-in share for the last 90 days…</>
          ) : walkInShare.totalBills === 0 ? (
            <>No completed bills in the last 90 days to measure walk-in share.</>
          ) : (
            <>
              {Math.round(walkInShare.walkInPct ?? 0)}% of completed bills in the last{" "}
              {walkInShare.windowDays} days were walk-in with no customer attached (
              {walkInShare.walkInBills.toLocaleString("en-IN")} of{" "}
              {walkInShare.totalBills.toLocaleString("en-IN")}) — those shoppers cannot appear
              here. This list covers the {namedCustomerCount.toLocaleString("en-IN")} customers
              you have names for.
            </>
          )}
        </AlertDescription>
      </Alert>

      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Quiet customers"
          value={dormant.length}
          valueFormat="int"
          sub={`${quietPct}% of named customers`}
          tone="neutral"
        />
        <InsightsKpiCard
          label="Lifetime value at risk"
          value={lifetimeValueAtRisk}
          valueFormat="inr"
          sub={`Total spend of the ${dormant.length.toLocaleString("en-IN")}`}
          tone="attention"
        />
        <InsightsKpiCard
          label="Never purchased"
          value={neverPurchasedIds.length}
          valueFormat="int"
          sub="Counted separately — not quiet"
          tone="neutral"
        />
      </InsightsKpiStrip>

      <InsightsPanel
        className="flex-1 min-h-0"
        title={`${dormant.length.toLocaleString("en-IN")} customers, quiet ${quietDays}+ days`}
        subtitle="Sorted by lifetime value — highest worth first, not longest gone. Quiet for = days since last completed bill (sale orders / quotations / challans do not count)."
        footer={
          dormant.length > visibleCount ? (
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                Showing {visibleDormant.length.toLocaleString("en-IN")} of{" "}
                {dormant.length.toLocaleString("en-IN")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Load more
              </Button>
            </div>
          ) : dormant.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              Showing all {dormant.length.toLocaleString("en-IN")}
            </span>
          ) : null
        }
      >
        {dormant.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No named customers are quiet for {quietDays}+ days.
          </div>
        ) : (
          <Table className="w-full min-w-max">
            <InsightsTableHeader>
              <InsightsStaticTh label="Customer" />
              <InsightsStaticTh label="Quiet for" className="text-right" />
              <InsightsStaticTh label="Last completed bill" />
              <InsightsStaticTh label="Orders" className="text-right" />
              <InsightsStaticTh label="Lifetime sales" className="text-right" />
            </InsightsTableHeader>
            <TableBody>
              {visibleDormant.map((row) => {
                const contact = contacts?.get(row.customerId);
                return (
                  <TableRow key={row.customerId} className={INSIGHTS_BODY_ROW}>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      <div className="font-medium text-slate-900">
                        {contact?.customer_name ?? "…"}
                      </div>
                      {contact?.phone ? (
                        <div className="text-xs text-muted-foreground">{contact.phone}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      <span className={daysToneClass(row.daysQuiet)}>
                        {row.daysQuiet.toLocaleString("en-IN")}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">days</span>
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "text-muted-foreground")}>
                      {formatDateLabel(row.lastSaleDate)}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      {row.orders.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      {formatInsightsINR(row.revenue)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </InsightsPanel>

      <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {neverPurchasedIds.length.toLocaleString("en-IN")} customers have never purchased
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            On your customer list with no completed bill. They are not “quiet” — nothing has
            lapsed — so they stay out of the list above and out of lifetime value at risk.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={neverPurchasedIds.length === 0}
          onClick={() => setShowNever((v) => !v)}
        >
          {showNever ? "Hide" : `View the ${neverPurchasedIds.length.toLocaleString("en-IN")}`}
        </Button>
      </div>

      {showNever && neverPurchasedIds.length > 0 && (
        <InsightsPanel
          className="shrink-0 max-h-56"
          title="Never purchased"
          subtitle="Up to 200 names shown"
        >
          <Table className="w-full">
            <InsightsTableHeader>
              <InsightsStaticTh label="Customer" />
              <InsightsStaticTh label="Phone" />
            </InsightsTableHeader>
            <TableBody>
              {neverPurchasedIds.slice(0, 200).map((id) => {
                const contact = contacts?.get(id);
                return (
                  <TableRow key={id} className={INSIGHTS_BODY_ROW}>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      {contact?.customer_name ?? "…"}
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "text-muted-foreground")}>
                      {contact?.phone || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </InsightsPanel>
      )}
    </div>
  );
}
