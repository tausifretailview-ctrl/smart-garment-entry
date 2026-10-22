import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, Ban, CalendarIcon, Download, FileText, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ACTIVITY_CATEGORIES,
  activityAmount,
  activityChangeSummary,
  activityDocumentNumber,
  activityParty,
  activityRowsToCsv,
  countInvoiceAlerts,
  describeActivity,
  diffActivityValues,
  getActivityCategory,
  INVOICE_ALERT_ACTIONS,
  isImportantActivity,
  matchesActivityCategory,
  type ActivityCategoryId,
  type ActivityLogRow,
  type ActivityTone,
} from "@/utils/activityLog";
import { UserScreenTimeReport } from "@/components/audit/UserScreenTimeReport";

const PAGE_SIZE = 200;
/** Rows read for the edit / delete / cancel tiles. */
const ALERT_COUNT_LIMIT = 5000;
const ALL_OPERATORS = "all";

const TONE_BADGE: Record<ActivityTone, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  create: "success",
  edit: "secondary",
  delete: "destructive",
  neutral: "outline",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : (error as { message?: string })?.message || fallback;
}

const PERIODS = [
  { id: "today", label: "Today", from: 0, to: 0 },
  { id: "yesterday", label: "Yesterday", from: 1, to: 1 },
  { id: "7d", label: "7 days", from: 6, to: 0 },
  { id: "30d", label: "30 days", from: 29, to: 0 },
] as const;

function fmtMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AuditLog() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { session } = useAuth();
  const orgId = currentOrganization?.id;
  const isMobile = useIsMobile();

  const [view, setView] = useState<"activity" | "screen-time">("activity");
  const [category, setCategory] = useState<string>("all");
  const [operatorId, setOperatorId] = useState<string>(ALL_OPERATORS);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfDay(subDays(new Date(), 6)));
  const [dateTo, setDateTo] = useState<Date>(() => startOfDay(new Date()));

  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLogRow | null>(null);
  const requestRef = useRef(0);

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.auditLog,
    orgId,
    useMemo(() => ({ category, operatorId, dateFrom, dateTo }), [category, operatorId, dateFrom, dateTo]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["category", setCategory],
          ["operatorId", setOperatorId],
        ],
        requiredDates: [
          ["dateFrom", setDateFrom],
          ["dateTo", setDateTo],
        ],
      });
    },
  );

  // Operator names: org members' emails (same source as the invoice dashboard's user filter).
  const { data: operators = [] } = useQuery({
    queryKey: ["activity-log-operators", orgId],
    queryFn: async () => {
      if (!orgId || !session?.access_token) return [] as Array<{ id: string; email: string }>;
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId);
      const memberIds = new Set((members || []).map((m: { user_id: string }) => m.user_id));
      if (memberIds.size === 0) return [];
      const { data: result } = await supabase.functions.invoke("get-users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const allUsers: Array<{ id: string; email: string }> = result?.users || [];
      return allUsers
        .filter((u) => memberIds.has(u.id) && u.email)
        .map((u) => ({ id: u.id, email: u.email }))
        .sort((a, b) => a.email.localeCompare(b.email));
    },
    enabled: !!orgId && !!session?.access_token,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!orgId) return { rows: [] as ActivityLogRow[], more: false };
      const cat = getActivityCategory(category);
      let query = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, user_email, action, entity_type, entity_id, old_values, new_values, metadata")
        .eq("organization_id", orgId)
        .gte("created_at", startOfDay(dateFrom).toISOString())
        .lt("created_at", addDays(startOfDay(dateTo), 1).toISOString())
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (operatorId !== ALL_OPERATORS) query = query.eq("user_id", operatorId);
      if (cat.actions) query = query.in("action", cat.actions);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as unknown as ActivityLogRow[];
      return { rows, more: rows.length === PAGE_SIZE };
    },
    [orgId, category, operatorId, dateFrom, dateTo],
  );

  // Invoice edit / delete / cancel counts for the period, whatever chip is picked.
  const { data: alertCounts, refetch: refetchAlertCounts } = useQuery({
    queryKey: ["activity-log-invoice-alerts", orgId, operatorId, dateFrom.toISOString(), dateTo.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("action, metadata")
        .eq("organization_id", orgId as string)
        .in("action", INVOICE_ALERT_ACTIONS)
        .gte("created_at", startOfDay(dateFrom).toISOString())
        .lt("created_at", addDays(startOfDay(dateTo), 1).toISOString())
        .limit(ALERT_COUNT_LIMIT);
      if (operatorId !== ALL_OPERATORS) query = query.eq("user_id", operatorId);
      const { data, error } = await query;
      if (error) throw error;
      return countInvoiceAlerts((data || []) as unknown as Pick<ActivityLogRow, "action" | "metadata">[]);
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loadFirstPage = useCallback(async () => {
    const req = ++requestRef.current;
    setLoading(true);
    try {
      const { rows, more } = await fetchPage(0);
      if (req !== requestRef.current) return;
      setLogs(rows);
      setHasMore(more);
    } catch (error: unknown) {
      if (req !== requestRef.current) return;
      setLogs([]);
      setHasMore(false);
      toast({
        title: "Error",
        description: errorMessage(error, "Failed to load activity log"),
        variant: "destructive",
      });
    } finally {
      if (req === requestRef.current) setLoading(false);
    }
  }, [fetchPage, toast]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    const req = requestRef.current;
    setLoadingMore(true);
    try {
      const { rows, more } = await fetchPage(logs.length);
      if (req !== requestRef.current) return;
      setLogs((prev) => [...prev, ...rows]);
      setHasMore(more);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: errorMessage(error, "Failed to load more"),
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (!matchesActivityCategory(log, category as ActivityCategoryId)) return false;
      if (!term) return true;
      const hay = [activityDocumentNumber(log), activityParty(log), log.user_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [logs, category, search]);

  const activePeriod = PERIODS.find(
    (p) =>
      startOfDay(subDays(new Date(), p.from)).getTime() === dateFrom.getTime() &&
      startOfDay(subDays(new Date(), p.to)).getTime() === dateTo.getTime(),
  )?.id;

  const pickPeriod = (p: (typeof PERIODS)[number]) => {
    setDateFrom(startOfDay(subDays(new Date(), p.from)));
    setDateTo(startOfDay(subDays(new Date(), p.to)));
  };

  const handleRefresh = () => {
    void loadFirstPage();
    void refetchAlertCounts();
  };

  const alertTiles = [
    { id: "invoice_edits", label: "Invoice edits", count: alertCounts?.edits, icon: Pencil, tone: "text-amber-600" },
    { id: "invoice_deletes", label: "Invoice deletes", count: alertCounts?.deletes, icon: Trash2, tone: "text-red-600" },
    { id: "invoice_cancels", label: "Invoice cancels", count: alertCounts?.cancels, icon: Ban, tone: "text-red-600" },
  ];

  const handleClearFilters = () => {
    setCategory("all");
    setOperatorId(ALL_OPERATORS);
    setSearch("");
    setDateFrom(startOfDay(subDays(new Date(), 6)));
    setDateTo(startOfDay(new Date()));
    clearPersistedFilters();
  };

  const handleExport = () => {
    const csv = activityRowsToCsv(visibleLogs, (iso) => format(new Date(iso), "dd/MM/yyyy HH:mm:ss"));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${format(dateFrom, "yyyyMMdd")}-${format(dateTo, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedDiff = selectedLog ? diffActivityValues(selectedLog.old_values, selectedLog.new_values) : [];

  const datePicker = (label: string, value: Date, onPick: (d: Date) => void) => (
    <div>
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(value, isMobile ? "dd MMM yy" : "dd MMM yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar mode="single" selected={value} onSelect={(d) => d && onPick(startOfDay(d))} initialFocus />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className={cn("min-h-screen bg-background", isMobile ? "px-3 py-3 pb-24" : "px-6 py-6")}>
      <div className="w-full">
        {!isMobile && <BackToDashboard />}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className={cn("text-primary shrink-0", isMobile ? "h-6 w-6" : "h-8 w-8")} />
            <div className="min-w-0">
              <h1 className={cn("font-bold text-foreground", isMobile ? "text-xl" : "text-3xl")}>Activity Log</h1>
              <p className="text-sm text-muted-foreground">
                {view === "activity"
                  ? "Every bill, edit, delete, cancel, discount, payment and return, by every login (admins too), with time."
                  : "When each user logged in and out, which screens they used, and how long they were working."}
              </p>
            </div>
          </div>
          {view === "activity" && (
            <div className="flex gap-2">
              {!isMobile && (
                <Button onClick={handleExport} variant="outline" size="sm" disabled={visibleLogs.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              )}
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                {!isMobile && "Refresh"}
              </Button>
            </div>
          )}
        </div>

        <div className="mb-4 inline-flex rounded-md border p-1 gap-1">
          <Button size="sm" variant={view === "activity" ? "default" : "ghost"} onClick={() => setView("activity")}>
            Edits & deletes
          </Button>
          <Button
            size="sm"
            variant={view === "screen-time" ? "default" : "ghost"}
            onClick={() => setView("screen-time")}
          >
            Logins & screen time
          </Button>
        </div>

        {view === "screen-time" && orgId ? (
          <UserScreenTimeReport orgId={orgId} operators={operators} />
        ) : (
          <>
            {/* Period */}
            <div className="mb-3 flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={activePeriod === p.id ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => pickPeriod(p)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {/* Invoice edit / delete / cancel tiles */}
            <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3 max-w-2xl">
              {alertTiles.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCategory(t.id)}
                    className={cn(
                      "rounded-xl border bg-card p-3 text-left shadow-sm transition-colors touch-manipulation",
                      category === t.id ? "border-primary ring-1 ring-primary" : "hover:bg-muted/50",
                      (t.count ?? 0) > 0 && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className={cn("h-3.5 w-3.5", t.tone)} />
                      {t.label}
                    </div>
                    <div className={cn("mt-1 text-2xl font-bold", (t.count ?? 0) > 0 ? t.tone : "text-foreground")}>
                      {t.count ?? "–"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Activity chips */}
            <div
              className={cn(
                "mb-4 flex gap-2",
                isMobile ? "-mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" : "flex-wrap",
              )}
            >
              {ACTIVITY_CATEGORIES.map((c) => (
                <Button
                  key={c.id}
                  variant={category === c.id ? "default" : "outline"}
                  size="sm"
                  className={cn("shrink-0", c.id === "important" && category !== c.id && "border-red-300 text-red-700")}
                  onClick={() => setCategory(c.id)}
                >
                  {c.id === "important" && <AlertTriangle className="h-3.5 w-3.5 mr-1" />}
                  {c.label}
                </Button>
              ))}
            </div>

            {/* Filters */}
            <Card className="mb-4">
              <CardContent className={isMobile ? "p-3" : "pt-6"}>
                <div className={cn("grid gap-4", isMobile ? "grid-cols-2 gap-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-5")}>
                  {datePicker("From", dateFrom, setDateFrom)}
                  {datePicker("To", dateTo, setDateTo)}

                  <div className={cn(isMobile && "col-span-2")}>
                    <Label>Operator</Label>
                    <Select value={operatorId} onValueChange={setOperatorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="All operators" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_OPERATORS}>All operators</SelectItem>
                        {operators.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!isMobile && (
                    <div>
                      <Label>Activity</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTIVITY_CATEGORIES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className={cn(isMobile && "col-span-2")}>
                    <Label>Search</Label>
                    <Input
                      placeholder="Bill no., customer, operator"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <Button onClick={handleClearFilters} variant="ghost" size="sm">
                    Clear filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={isMobile ? "p-3 pb-2" : undefined}>
                <CardTitle className={isMobile ? "text-base" : undefined}>
                  {visibleLogs.length} {visibleLogs.length === 1 ? "entry" : "entries"}
                  {hasMore ? " (more available)" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className={isMobile ? "p-3 pt-0" : undefined}>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading activity…</div>
                ) : visibleLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No activity for these filters</div>
                ) : isMobile ? (
                  <div className="space-y-2">
                    {visibleLogs.map((log) => {
                      const { label, tone } = describeActivity(log);
                      const amount = activityAmount(log);
                      const important = isImportantActivity(log);
                      const changes = activityChangeSummary(log, 2);
                      return (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className={cn(
                            "w-full rounded-xl border bg-card p-3 text-left shadow-sm active:bg-muted/50 touch-manipulation",
                            important && "border-l-4 border-l-red-500 bg-red-50/60 dark:bg-red-950/20",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant={TONE_BADGE[tone]} className="whitespace-nowrap">
                              {important && <AlertTriangle className="h-3 w-3 mr-1" />}
                              {label}
                            </Badge>
                            <span className="text-sm font-semibold whitespace-nowrap">
                              {amount == null ? "" : fmtMoney(amount)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium truncate">
                              {activityDocumentNumber(log) ?? "—"}
                              {activityParty(log) ? ` · ${activityParty(log)}` : ""}
                            </span>
                          </div>
                          {changes && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{changes}</div>}
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{log.user_email || "System"}</span>
                            <span className="whitespace-nowrap">
                              {format(new Date(log.created_at), "dd MMM, hh:mm:ss a")}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Date & time</TableHead>
                          <TableHead>Operator</TableHead>
                          <TableHead>Activity</TableHead>
                          <TableHead>Document</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>What changed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleLogs.map((log) => {
                          const { label, tone } = describeActivity(log);
                          const amount = activityAmount(log);
                          const important = isImportantActivity(log);
                          return (
                            <TableRow
                              key={log.id}
                              className={cn(
                                "cursor-pointer",
                                important && "bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50",
                              )}
                              onClick={() => setSelectedLog(log)}
                            >
                              <TableCell className="whitespace-nowrap text-sm">
                                {format(new Date(log.created_at), "dd MMM yyyy, hh:mm:ss a")}
                              </TableCell>
                              <TableCell className="text-sm">{log.user_email || "System"}</TableCell>
                              <TableCell>
                                <Badge variant={TONE_BADGE[tone]} className="whitespace-nowrap">
                                  {important && <AlertTriangle className="h-3 w-3 mr-1" />}
                                  {label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {activityDocumentNumber(log) ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">
                                {activityParty(log) ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm text-right whitespace-nowrap">
                                {amount == null ? "—" : fmtMoney(amount)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                                {activityChangeSummary(log)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {!loading && hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto w-[calc(100vw-1.5rem)] sm:w-full">
            <DialogHeader>
              <DialogTitle>{selectedLog ? describeActivity(selectedLog).label : ""}</DialogTitle>
              <DialogDescription>
                {selectedLog &&
                  `${selectedLog.user_email || "System"} · ${format(new Date(selectedLog.created_at), "dd MMM yyyy, hh:mm:ss a")}`}
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-4">
                {selectedDiff.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedDiff.map((d) => (
                        <TableRow key={d.key} className={cn(d.changed && "bg-amber-50 dark:bg-amber-950/30")}>
                          <TableCell className="text-sm font-medium">{d.label}</TableCell>
                          <TableCell className={cn("text-sm", d.changed && "line-through text-muted-foreground")}>
                            {d.before}
                          </TableCell>
                          <TableCell className={cn("text-sm", d.changed && "font-semibold")}>{d.after}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No field values were recorded for this entry.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
