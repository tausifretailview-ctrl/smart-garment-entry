import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformWhatsAppLinkAlerts } from "@/components/PlatformWhatsAppLinkAlerts";
import { getWhatsAppErrorHint } from "@/utils/whatsappErrorHints";
import { shopWhatsAppHealth, type ShopWhatsAppHealthRow, type ShopHealthState } from "@/utils/shopWhatsAppHealth";

const PROVIDER_LABELS: Record<string, string> = {
  builtin: "Ezzy ERP WhatsApp",
  wappconnect: "WappConnect",
  existing: "Meta / BSP",
};

const STATE_BADGES: Record<ShopHealthState, { label: string; className: string }> = {
  ok: { label: "Working", className: "bg-green-100 text-green-800 border-green-300" },
  failing: { label: "Failing", className: "bg-red-100 text-red-800 border-red-300" },
  unlinked: { label: "Not linked", className: "bg-red-100 text-red-800 border-red-300" },
  idle: { label: "No sends", className: "bg-muted text-muted-foreground" },
  off: { label: "Off", className: "bg-muted text-muted-foreground" },
};

type DayPick = "today" | "yesterday" | "date";
type StateFilter = "all" | "problem" | "builtin" | "wappconnect";

/**
 * WhatsApp Logs > All shops health (support staff of the DEMO shop only, read-only):
 * Ezzy ERP WhatsApp link alerts plus every shop's message counts for one day.
 */
export function AllShopsWhatsAppHealth({ viewerOrganizationId }: { viewerOrganizationId: string }) {
  const [dayPick, setDayPick] = useState<DayPick>("today");
  const [pickedDate, setPickedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  const day =
    dayPick === "yesterday"
      ? format(subDays(new Date(), 1), "yyyy-MM-dd")
      : dayPick === "date" && pickedDate
        ? pickedDate
        : format(new Date(), "yyyy-MM-dd");

  const { data: rows = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["all-shops-whatsapp-health", viewerOrganizationId, day],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_all_shops_whatsapp_health" as never,
        { p_organization_id: viewerOrganizationId, p_date: day } as never,
      );
      if (error) throw error;
      return (data as unknown as ShopWhatsAppHealthRow[] | null) ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev) => prev,
  });

  const withState = useMemo(() => rows.map((r) => ({ ...r, state: shopWhatsAppHealth(r) })), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withState.filter((r) => {
      if (q && !r.organization_name?.toLowerCase().includes(q)) return false;
      if (stateFilter === "problem") return r.state === "failing" || r.state === "unlinked";
      if (stateFilter === "builtin" || stateFilter === "wappconnect") return r.send_provider === stateFilter;
      return true;
    });
  }, [withState, search, stateFilter]);

  const totals = useMemo(() => {
    let messages = 0;
    let failed = 0;
    let sending = 0;
    let problems = 0;
    for (const r of withState) {
      messages += Number(r.total_count) || 0;
      failed += Number(r.failed_count) || 0;
      if (Number(r.total_count) > 0) sending += 1;
      if (r.state === "failing" || r.state === "unlinked") problems += 1;
    }
    return { messages, failed, sending, problems };
  }, [withState]);

  return (
    <div className="space-y-4">
      <PlatformWhatsAppLinkAlerts viewerOrganizationId={viewerOrganizationId} showWhenAllLinked />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Messages", value: totals.messages },
          { label: "Failed", value: totals.failed, red: totals.failed > 0 },
          { label: "Shops sending", value: totals.sending },
          { label: "Shops with a problem", value: totals.problems, red: totals.problems > 0 },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-4 text-center">
              <div className={`text-2xl font-bold ${t.red ? "text-red-600" : ""}`}>{t.value}</div>
              <div className="text-sm text-muted-foreground">{t.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">All shops: messages on {format(new Date(day), "dd/MM/yyyy")}</CardTitle>
              <CardDescription>
                Read-only. "Last OK" and "Last error" look at the last 2 days of sends.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Reload
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Select value={dayPick} onValueChange={(v) => setDayPick(v as DayPick)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="date">Select date</SelectItem>
              </SelectContent>
            </Select>
            {dayPick === "date" && (
              <Input
                type="date"
                className="w-[160px]"
                value={pickedDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setPickedDate(e.target.value)}
              />
            )}
            <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as StateFilter)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                <SelectItem value="problem">Only problems</SelectItem>
                <SelectItem value="builtin">Ezzy ERP WhatsApp</SelectItem>
                <SelectItem value="wappconnect">WappConnect</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search shop" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">Could not load: {(error as Error).message}</p>
          ) : isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shop</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Read</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead>Last OK</TableHead>
                    <TableHead>Last error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-6">No shops</TableCell>
                    </TableRow>
                  )}
                  {visible.map((r) => {
                    const badge = STATE_BADGES[r.state];
                    const hint = r.last_error ? getWhatsAppErrorHint(r.last_error, null, r.send_provider) : null;
                    return (
                      <TableRow key={r.organization_id}>
                        <TableCell className="font-medium">
                          {r.organization_name}
                          {r.send_provider === "builtin" && r.builtin_number && (
                            <div className="text-xs text-muted-foreground">+{r.builtin_number}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.send_provider ? PROVIDER_LABELS[r.send_provider] ?? r.send_provider : "—"}
                          {r.send_provider && !r.integration_on && (
                            <div className="text-xs text-muted-foreground">Integration off</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{r.total_count}</TableCell>
                        <TableCell className="text-right">{r.sent_count}</TableCell>
                        <TableCell className="text-right">{r.delivered_count}</TableCell>
                        <TableCell className="text-right">{r.read_count}</TableCell>
                        <TableCell className={`text-right ${Number(r.failed_count) > 0 ? "text-red-600 font-medium" : ""}`}>
                          {r.failed_count}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {r.last_ok_at ? formatDistanceToNow(new Date(r.last_ok_at), { addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[280px]">
                          {r.last_error ? (
                            <div title={r.last_error}>
                              <div className="text-red-700 dark:text-red-400 truncate">{hint?.title ?? r.last_error}</div>
                              {r.last_failed_at && (
                                <div className="text-muted-foreground">
                                  {formatDistanceToNow(new Date(r.last_failed_at), { addSuffix: true })}
                                </div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
