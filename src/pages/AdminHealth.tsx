import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, CheckCircle2, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import { Layout } from "@/components/Layout";

type DateRange = "24h" | "7d" | "30d";

interface ErrorLogRow {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  page_path: string | null;
  operation: string;
  error_message: string;
  error_stack: string | null;
  error_code: string | null;
  browser_info: any;
  additional_context: any;
  created_at: string;
  organizations?: { org_name?: string } | null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AdminHealth() {
  const { roles, loading: rolesLoading } = useUserRoles();
  const isAdmin = roles.includes("admin") || roles.includes("platform_admin");

  const [dateRange, setDateRange] = useState<DateRange>("24h");
  const [operation, setOperation] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["app-error-logs", dateRange, operation],
    queryFn: async (): Promise<ErrorLogRow[]> => {
      const since = new Date();
      if (dateRange === "24h") since.setHours(since.getHours() - 24);
      else if (dateRange === "7d") since.setDate(since.getDate() - 7);
      else since.setDate(since.getDate() - 30);

      let query = (supabase as any)
        .from("app_error_logs")
        .select(`
          id, organization_id, user_id, page_path, operation,
          error_message, error_stack, error_code,
          browser_info, additional_context, created_at,
          organizations:organization_id (org_name)
        `)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (operation && operation !== "all") {
        query = query.eq("operation", operation);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ErrorLogRow[];
    },
    enabled: !rolesLoading && isAdmin,
    staleTime: 30_000,
  });

  const operations = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((r) => set.add(r.operation));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data || [];
    const q = search.toLowerCase();
    return (data || []).filter(
      (r) =>
        r.error_message.toLowerCase().includes(q) ||
        r.operation.toLowerCase().includes(q) ||
        (r.page_path || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  // Summary metrics
  const summary = useMemo(() => {
    const all = data || [];
    const now = Date.now();
    const last24h = all.filter((r) => now - new Date(r.created_at).getTime() < 86_400_000);
    const last7d = all.filter((r) => now - new Date(r.created_at).getTime() < 7 * 86_400_000);
    const opCounts24h = new Map<string, number>();
    last24h.forEach((r) => opCounts24h.set(r.operation, (opCounts24h.get(r.operation) || 0) + 1));
    let topOp = { name: "—", count: 0 };
    opCounts24h.forEach((count, name) => {
      if (count > topOp.count) topOp = { name, count };
    });
    return {
      count24h: last24h.length,
      count7d: last7d.length,
      distinctOps24h: opCounts24h.size,
      topOp,
    };
  }, [data]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (rolesLoading) {
    return (
      <Layout>
        <div className="p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center space-y-4">
              <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Not Authorized</h2>
              <p className="text-sm text-muted-foreground">
                You need admin privileges to access System Health.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">System Health</h1>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">
                Errors (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums font-mono">{summary.count24h}</span>
                {summary.count24h > 0 && <Badge variant="destructive" className="text-[10px]">ACTIVE</Badge>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">
                Errors (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold tabular-nums font-mono">{summary.count7d}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">
                Distinct Ops (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold tabular-nums font-mono">{summary.distinctOps24h}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">
                Top Failing (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm font-semibold truncate" title={summary.topOp.name}>
                {summary.topOp.name}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">{summary.topOp.count} failures</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={operation} onValueChange={setOperation}>
              <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All operations</SelectItem>
                {operations.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search error message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-64 h-9"
            />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                <p className="text-muted-foreground">No errors in selected period</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Page</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const isOpen = expanded.has(row.id);
                    return (
                      <React.Fragment key={row.id}>
                        <TableRow
                          key={row.id}
                          onClick={() => toggle(row.id)}
                          className="cursor-pointer"
                        >
                          <TableCell>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="tabular-nums font-mono text-xs whitespace-nowrap">
                            {relativeTime(row.created_at)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.organizations?.org_name || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {row.operation}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xl truncate" title={row.error_message}>
                            {row.error_message.slice(0, 80)}
                            {row.error_message.length > 80 ? "…" : ""}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-48">
                            {row.page_path || "—"}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${row.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={6} className="p-4">
                              <div className="space-y-3 text-xs">
                                <div>
                                  <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Full Message</div>
                                  <div className="font-mono p-2 bg-background border rounded">{row.error_message}</div>
                                </div>
                                {row.error_stack && (
                                  <div>
                                    <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Stack Trace</div>
                                    <pre className="font-mono p-2 bg-background border rounded overflow-auto max-h-64 text-[11px]">
                                      {row.error_stack}
                                    </pre>
                                  </div>
                                )}
                                {row.additional_context && (
                                  <div>
                                    <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Additional Context</div>
                                    <pre className="font-mono p-2 bg-background border rounded overflow-auto max-h-48 text-[11px]">
                                      {JSON.stringify(row.additional_context, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {row.browser_info && (
                                  <div>
                                    <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Browser</div>
                                    <pre className="font-mono p-2 bg-background border rounded overflow-auto text-[11px]">
                                      {JSON.stringify(row.browser_info, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {row.error_code && (
                                  <div className="text-muted-foreground">
                                    <span className="font-semibold">Code:</span> <span className="font-mono">{row.error_code}</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
