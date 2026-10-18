import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfDay } from "date-fns";
import { CalendarIcon, Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  breakdownByScreen,
  buildTimeline,
  formatDuration,
  screenLabel,
  summarizeByUser,
  visitOpenSeconds,
  visitStatus,
  type LoginRow,
  type ScreenTimeRow,
} from "@/utils/screenTimeReport";

const ALL_USERS = "all";
const PAGE = 1000;
const MAX_ROWS = 20_000;
const TIMELINE_LIMIT = 300;

const DEVICE_LABELS: Record<string, string> = {
  web: "Browser",
  "mobile-web": "Phone browser",
  "desktop-app": "Desktop app",
  "android-app": "Android app",
};

type Props = {
  orgId: string;
  operators: Array<{ id: string; email: string }>;
};

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function UserScreenTimeReport({ orgId, operators }: Props) {
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfDay(new Date()));
  const [dateTo, setDateTo] = useState<Date>(() => startOfDay(new Date()));

  const emailById = useMemo(() => new Map(operators.map((o) => [o.id, o.email])), [operators]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["user-screen-time", orgId, userId, dateFrom.toISOString(), dateTo.toISOString()],
    queryFn: async () => {
      const fromIso = startOfDay(dateFrom).toISOString();
      const toIso = addDays(startOfDay(dateTo), 1).toISOString();
      const rows: ScreenTimeRow[] = [];
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
        let q = supabase
          .from("user_screen_time")
          .select(
            "id, user_id, user_email, app_session_id, screen, started_at, last_seen_at, active_seconds, ended_reason, device",
          )
          .eq("organization_id", orgId)
          .gte("started_at", fromIso)
          .lt("started_at", toIso)
          .order("started_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (userId !== ALL_USERS) q = q.eq("user_id", userId);
        const { data: page, error: pageError } = await q;
        if (pageError) throw pageError;
        rows.push(...((page || []) as ScreenTimeRow[]));
        if (!page || page.length < PAGE) break;
      }

      let lq = supabase
        .from("audit_logs")
        .select("user_id, user_email, created_at")
        .eq("organization_id", orgId)
        .eq("action", "LOGIN")
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (userId !== ALL_USERS) lq = lq.eq("user_id", userId);
      const { data: loginData } = await lq;
      return { rows, logins: (loginData || []) as LoginRow[] };
    },
    enabled: !!orgId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const logins = useMemo(() => data?.logins ?? [], [data]);
  const summaries = useMemo(() => summarizeByUser(rows, logins, emailById), [rows, logins, emailById]);
  const screens = useMemo(() => breakdownByScreen(rows), [rows]);
  const timeline = useMemo(() => buildTimeline(rows, logins, emailById), [rows, logins, emailById]);
  const missingTable = !!error && /user_screen_time/.test((error as { message?: string }).message || "");

  const handleExport = () => {
    const header = ["Date & time", "User", "Event", "Screen", "Open for", "Working", "Ended", "Device"];
    const lines = timeline.map((t) =>
      t.kind === "login"
        ? [format(new Date(t.at), "dd/MM/yyyy HH:mm:ss"), t.email, "Logged in", "", "", "", "", ""]
        : [
            format(new Date(t.at), "dd/MM/yyyy HH:mm:ss"),
            t.email,
            "Screen",
            screenLabel(t.row.screen),
            formatDuration(visitOpenSeconds(t.row)),
            formatDuration(t.row.active_seconds),
            visitStatus(t.row),
            DEVICE_LABELS[t.row.device ?? ""] ?? t.row.device ?? "",
          ],
    );
    const csv = [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `screen-time-${format(dateFrom, "yyyyMMdd")}-${format(dateTo, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateField = (label: string, value: Date, onChange: (d: Date) => void) => (
    <div>
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(value, "dd MMM yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(startOfDay(d))} initialFocus />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {dateField("From", dateFrom, setDateFrom)}
            {dateField("To", dateTo, setDateTo)}
            <div>
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_USERS}>All users</SelectItem>
                  {operators.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={timeline.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Open = time the app was on screen. Working = time the user typed, clicked or scrolled (no input for a minute
            counts as idle). Screen time is saved every few minutes, so the last few minutes may not show yet.
          </p>
        </CardContent>
      </Card>

      {missingTable ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Screen time is not switched on for this shop yet.
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Could not load screen time: {(error as { message?: string }).message || "unknown error"}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading screen time…</div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
            </CardHeader>
            <CardContent>
              {summaries.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">No logins or screen time for these dates</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="whitespace-nowrap">First seen</TableHead>
                        <TableHead className="whitespace-nowrap">Last seen</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                        <TableHead className="text-right">Working</TableHead>
                        <TableHead className="text-right">Idle</TableHead>
                        <TableHead className="text-right">Logins</TableHead>
                        <TableHead className="text-right">Logouts</TableHead>
                        <TableHead>Most used screens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaries.map((s) => (
                        <TableRow
                          key={s.userId}
                          className="cursor-pointer"
                          onClick={() => setUserId(userId === s.userId ? ALL_USERS : s.userId)}
                        >
                          <TableCell className="text-sm font-medium">{s.email}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(new Date(s.firstSeen), "dd MMM, hh:mm a")}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(new Date(s.lastSeen), "dd MMM, hh:mm a")}
                          </TableCell>
                          <TableCell className="text-sm text-right">{formatDuration(s.openSeconds)}</TableCell>
                          <TableCell className="text-sm text-right font-semibold">
                            {formatDuration(s.activeSeconds)}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">
                            {formatDuration(Math.max(0, s.openSeconds - s.activeSeconds))}
                          </TableCell>
                          <TableCell className="text-sm text-right">{s.logins}</TableCell>
                          <TableCell className="text-sm text-right">{s.logouts}</TableCell>
                          <TableCell className="text-sm">
                            {s.topScreens.length === 0
                              ? "—"
                              : s.topScreens
                                  .map((t) => `${screenLabel(t.screen)} (${formatDuration(t.activeSeconds)})`)
                                  .join(", ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {screens.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Screens{userId !== ALL_USERS ? ` · ${emailById.get(userId) ?? ""}` : ""}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Screen</TableHead>
                        <TableHead className="text-right">Visits</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                        <TableHead className="text-right">Working</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {screens.map((b) => (
                        <TableRow key={b.screen}>
                          <TableCell className="text-sm">{screenLabel(b.screen)}</TableCell>
                          <TableCell className="text-sm text-right">{b.visits}</TableCell>
                          <TableCell className="text-sm text-right">{formatDuration(b.openSeconds)}</TableCell>
                          <TableCell className="text-sm text-right font-semibold">
                            {formatDuration(b.activeSeconds)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Timeline
                  {timeline.length > TIMELINE_LIMIT ? ` (latest ${TIMELINE_LIMIT} of ${timeline.length})` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Date & time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Screen</TableHead>
                        <TableHead className="text-right">Open for</TableHead>
                        <TableHead className="text-right">Working</TableHead>
                        <TableHead>Ended</TableHead>
                        <TableHead>Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeline.slice(0, TIMELINE_LIMIT).map((t) =>
                        t.kind === "login" ? (
                          <TableRow key={`login-${t.at}-${t.email}`}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(t.at), "dd MMM yyyy, hh:mm:ss a")}
                            </TableCell>
                            <TableCell className="text-sm">{t.email}</TableCell>
                            <TableCell colSpan={5}>
                              <Badge variant="success">Logged in</Badge>
                            </TableCell>
                          </TableRow>
                        ) : (
                          <TableRow key={t.row.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(t.at), "dd MMM yyyy, hh:mm:ss a")}
                            </TableCell>
                            <TableCell className="text-sm">{t.email}</TableCell>
                            <TableCell className="text-sm">{screenLabel(t.row.screen)}</TableCell>
                            <TableCell className="text-sm text-right">
                              {formatDuration(visitOpenSeconds(t.row))}
                            </TableCell>
                            <TableCell className="text-sm text-right font-semibold">
                              {formatDuration(t.row.active_seconds)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {t.row.ended_reason === "logout" ? (
                                <Badge variant="destructive">Logged out</Badge>
                              ) : (
                                visitStatus(t.row)
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {DEVICE_LABELS[t.row.device ?? ""] ?? t.row.device ?? "—"}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
