import { useCallback, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCheck,
  Eye,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { createCustomerPageLinkForSale } from "@/utils/customerPageLink";
import {
  buildPushInviteMessage,
  customersNotEnabled,
  enabledPhones,
  matchesPushStatus,
  pushFailureLabel,
  pushMessageStage,
  summarizePushMessages,
  type PushMessageRow,
  type PushStatusFilter,
  type PushSubscriptionRow,
  type SaleForInvite,
} from "@/utils/customerPushStats";

const MAX_MESSAGES = 3000;
const MAX_SALES = 5000;

type TabId = "messages" | "subscribed" | "not-enabled";

interface SaleInfo {
  sale_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

const fmt = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd-MM-yy HH:mm") : "–");

const LINK_FAILURE_TEXT: Record<string, string> = {
  no_domain: "Customer page domain is not set for this app.",
  page_off: "Turn on Customer page in Settings → Customer page first.",
  no_subdomain: "Set your shop web address (subdomain) in Settings first.",
  rpc_failed: "Could not create the bill link. Try again.",
  whatsapp_switch_off: "Could not create the bill link.",
};

async function fetchMessages(orgId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("push_messages")
    .select("id, status, created_at, sent_at, delivered_at, opened_at, dismissed_at, error_code, sale_id, campaign_id, subscription_id")
    .eq("organization_id", orgId)
    .gte("created_at", `${from}T00:00:00+05:30`)
    .lte("created_at", `${to}T23:59:59.999+05:30`)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);
  if (error) throw error;
  const rows = (data ?? []) as PushMessageRow[];

  const saleIds = Array.from(new Set(rows.map((r) => r.sale_id).filter((id): id is string => !!id)));
  const sales = new Map<string, SaleInfo>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data: s } = await supabase
      .from("sales")
      .select("id, sale_number, customer_name, customer_phone")
      .eq("organization_id", orgId)
      .in("id", saleIds.slice(i, i + 200));
    for (const row of s ?? []) sales.set(row.id, row);
  }
  return { rows, sales };
}

async function fetchSubscriptions(orgId: string): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, customer_phone_last10, customer_id, status, receives_invoices, confirmed_at, created_at, last_seen_at, inactive_reason")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRow[];
}

async function fetchSalesForInvite(orgId: string, from: string, to: string): Promise<SaleForInvite[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_number, customer_name, customer_phone, sale_date, net_amount")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .not("customer_phone", "is", null)
    .gte("sale_date", from)
    .lte("sale_date", `${to}T23:59:59.999`)
    .order("sale_date", { ascending: false })
    .limit(MAX_SALES);
  if (error) throw error;
  return (data ?? []) as SaleForInvite[];
}

const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  opened: { label: "Read", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  delivered: { label: "Delivered", className: "bg-sky-100 text-sky-800 border-sky-200" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 border-blue-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  queued: { label: "Queued", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Bell;
  tone: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl p-3 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5",
        tone,
        active && "ring-2 ring-offset-2 ring-slate-700",
        !onClick && "cursor-default hover:translate-y-0",
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide opacity-90">
        {label}
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs opacity-90">{sub}</div> : null}
    </button>
  );
}

/** Reports → Customer Notifications: what push sent, delivered, read or failed, and who has not turned it on. */
export default function CustomerNotifications() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { orgNavigate } = useOrgNavigation();
  const { sendWhatsApp } = useWhatsAppSend();
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tab, setTab] = useState<TabId>("messages");
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set(["messages"]));
  const [statusFilter, setStatusFilter] = useState<PushStatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "bill" | "offer">("all");
  const [search, setSearch] = useState("");
  const [invited, setInvited] = useState<Set<string>>(() => new Set());
  const [inviting, setInviting] = useState<string | null>(null);

  const changeTab = useCallback((t: string) => {
    const id = t as TabId;
    setTab(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  const settingsQ = useQuery({
    queryKey: ["customer-notifications-settings", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_page_settings")
        .select("enabled, push_enabled")
        .eq("organization_id", orgId!)
        .maybeSingle();
      return data;
    },
  });

  const messagesQ = useQuery({
    queryKey: ["customer-notifications-messages", orgId, fromDate, toDate],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fetchMessages(orgId!, fromDate, toDate),
  });

  const subsQ = useQuery({
    queryKey: ["customer-notifications-subs", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fetchSubscriptions(orgId!),
  });

  const salesQ = useQuery({
    queryKey: ["customer-notifications-sales", orgId, fromDate, toDate],
    enabled: !!orgId && visited.has("not-enabled"),
    staleTime: 60_000,
    queryFn: () => fetchSalesForInvite(orgId!, fromDate, toDate),
  });

  const messages = useMemo(() => messagesQ.data?.rows ?? [], [messagesQ.data]);
  const subs = useMemo(() => subsQ.data ?? [], [subsQ.data]);
  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
  const summary = useMemo(() => summarizePushMessages(messages), [messages]);
  const onPhones = useMemo(() => enabledPhones(subs), [subs]);
  const activeSubs = useMemo(() => subs.filter((s) => s.status === "confirmed"), [subs]);
  const notEnabled = useMemo(
    () => customersNotEnabled(salesQ.data ?? [], onPhones),
    [salesQ.data, onPhones],
  );

  const q = search.trim().toLowerCase();

  const messageRows = useMemo(() => {
    const sales = messagesQ.data?.sales;
    return messages
      .filter((m) => matchesPushStatus(m, statusFilter))
      .filter((m) => kindFilter === "all" || (kindFilter === "offer" ? !!m.campaign_id : !m.campaign_id))
      .map((m) => {
        const sale = m.sale_id ? sales?.get(m.sale_id) : undefined;
        const sub = subById.get(m.subscription_id);
        return {
          ...m,
          stage: pushMessageStage(m),
          sale_number: sale?.sale_number ?? "",
          customer_name: sale?.customer_name ?? "",
          phone: sub?.customer_phone_last10 || sale?.customer_phone || "",
        };
      })
      .filter((r) => !q || [r.sale_number, r.customer_name, r.phone, r.error_code].join(" ").toLowerCase().includes(q));
  }, [messages, messagesQ.data, statusFilter, kindFilter, subById, q]);

  const subRows = useMemo(
    () => subs.filter((s) => !q || [s.customer_phone_last10, s.status, s.inactive_reason].join(" ").toLowerCase().includes(q)),
    [subs, q],
  );
  const notEnabledRows = useMemo(
    () => notEnabled.filter((c) => !q || [c.phone, c.customer_name, c.lastSaleNumber].join(" ").toLowerCase().includes(q)),
    [notEnabled, q],
  );

  const invite = async (c: (typeof notEnabled)[number]) => {
    if (!orgId) return;
    setInviting(c.phone);
    try {
      const link = await createCustomerPageLinkForSale(orgId, c.lastSaleId);
      if (!link.ok) {
        toast.error("Could not make the bill link", { description: LINK_FAILURE_TEXT[link.reason] ?? link.detail });
        return;
      }
      await sendWhatsApp(
        c.phone,
        buildPushInviteMessage({
          customerName: c.customer_name,
          shopName: currentOrganization?.name ?? "our shop",
          url: link.url,
        }),
      );
      setInvited((prev) => new Set([...prev, c.phone]));
    } finally {
      setInviting(null);
    }
  };

  const pageOff = settingsQ.data && (!settingsQ.data.enabled || !settingsQ.data.push_enabled);
  const loadError = messagesQ.error || subsQ.error;

  return (
    <div className="flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={() => orgNavigate("/reports")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Bell className="h-5 w-5 shrink-0" />
                Customer Notifications
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Bill and offer notifications on customers' phones · sent, read, failed · invite customers to turn on
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 shrink-0">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-[9.5rem] text-sm bg-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-[9.5rem] text-sm bg-white" />
            </div>
            <Input
              className="h-9 w-[220px] bg-white"
              placeholder="Bill no, customer, phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {pageOff ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shrink-0">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Customer notifications are off. Turn on Customer page and Push notifications in Settings → Customer page.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6 shrink-0">
          <KpiCard
            label="Sent"
            value={summary.sent.toLocaleString("en-IN")}
            sub={`${summary.total.toLocaleString("en-IN")} total`}
            icon={Send}
            tone="bg-gradient-to-br from-blue-500 to-blue-700"
            active={tab === "messages" && statusFilter === "sent"}
            onClick={() => { changeTab("messages"); setStatusFilter("sent"); }}
          />
          <KpiCard
            label="Delivered"
            value={summary.delivered.toLocaleString("en-IN")}
            icon={CheckCheck}
            tone="bg-gradient-to-br from-sky-500 to-sky-700"
            active={tab === "messages" && statusFilter === "delivered"}
            onClick={() => { changeTab("messages"); setStatusFilter("delivered"); }}
          />
          <KpiCard
            label="Customer read"
            value={summary.opened.toLocaleString("en-IN")}
            sub={summary.sent ? `${summary.openRate}% of sent` : undefined}
            icon={Eye}
            tone="bg-gradient-to-br from-emerald-500 to-emerald-700"
            active={tab === "messages" && statusFilter === "opened"}
            onClick={() => { changeTab("messages"); setStatusFilter("opened"); }}
          />
          <KpiCard
            label="Failed"
            value={summary.failed.toLocaleString("en-IN")}
            icon={XCircle}
            tone="bg-gradient-to-br from-red-500 to-red-700"
            active={tab === "messages" && statusFilter === "failed"}
            onClick={() => { changeTab("messages"); setStatusFilter("failed"); }}
          />
          <KpiCard
            label="Phones turned on"
            value={onPhones.size.toLocaleString("en-IN")}
            sub={`${activeSubs.length.toLocaleString("en-IN")} active devices`}
            icon={Smartphone}
            tone="bg-gradient-to-br from-violet-500 to-violet-700"
            active={tab === "subscribed"}
            onClick={() => changeTab("subscribed")}
          />
          <KpiCard
            label="Not turned on"
            value={visited.has("not-enabled") && !salesQ.isLoading ? notEnabled.length.toLocaleString("en-IN") : "Check"}
            sub="customers with bills in period"
            icon={BellOff}
            tone="bg-gradient-to-br from-amber-500 to-orange-600"
            active={tab === "not-enabled"}
            onClick={() => changeTab("not-enabled")}
          />
        </div>

        {loadError ? (
          <p className="text-sm text-destructive shrink-0">
            Could not load notifications: {loadError instanceof Error ? loadError.message : String(loadError)}
          </p>
        ) : null}

        <Tabs value={tab} onValueChange={changeTab} className="flex flex-col flex-1 min-h-0 gap-2">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
            {(
              [
                ["messages", `Messages (${summary.total})`],
                ["subscribed", `Turned on (${activeSubs.length})`],
                ["not-enabled", "Not turned on"],
              ] as const
            ).map(([id, label]) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  "h-9 px-4 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
                  "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
                )}
              >
                {label}
              </TabsTrigger>
            ))}
            {tab === "messages" ? (
              <div className="ml-auto flex gap-2">
                <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
                  <SelectTrigger className="h-9 w-[130px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Bills + offers</SelectItem>
                    <SelectItem value="bill">Bills</SelectItem>
                    <SelectItem value="offer">Offers</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PushStatusFilter)}>
                  <SelectTrigger className="h-9 w-[140px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="opened">Read</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </TabsList>

          <TabsContent value="messages" className="flex-1 min-h-0 mt-0 overflow-auto rounded-lg border bg-white data-[state=inactive]:hidden">
            {messagesQ.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p>
            ) : messageRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No notifications in this period.</p>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-800">
                  <TableRow>
                    {["Date", "Type", "Bill No", "Customer", "Phone", "Status", "Delivered", "Read", "Reason"].map((h) => (
                      <TableHead key={h} className="font-bold text-white whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messageRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                      <TableCell>{r.campaign_id ? "Offer" : "Bill"}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{r.sale_number || "–"}</TableCell>
                      <TableCell>{r.customer_name || "–"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.phone || "–"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STAGE_BADGE[r.stage].className}>{STAGE_BADGE[r.stage].label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(r.delivered_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(r.opened_at)}</TableCell>
                      <TableCell className="max-w-[320px] text-xs text-red-700" title={r.error_code ?? ""}>
                        {r.stage === "failed" ? pushFailureLabel(r.error_code) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="subscribed" className="flex-1 min-h-0 mt-0 overflow-auto rounded-lg border bg-white data-[state=inactive]:hidden">
            {subsQ.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : subRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No customer has turned on notifications yet. Use the "Not turned on" tab to invite them.
              </p>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-800">
                  <TableRow>
                    {["Phone", "Status", "Bill alerts", "Turned on", "Last seen", "Note"].map((h) => (
                      <TableHead key={h} className="font-bold text-white whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subRows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap font-medium">{s.customer_phone_last10}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={s.status === "confirmed" ? STAGE_BADGE.opened.className : STAGE_BADGE.queued.className}
                        >
                          {s.status === "confirmed" ? "On" : s.status === "inactive" ? "Off" : s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.receives_invoices ? "Yes" : "No"}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(s.confirmed_at ?? s.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(s.last_seen_at)}</TableCell>
                      <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                        {s.inactive_reason ? pushFailureLabel(s.inactive_reason) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="not-enabled" className="flex-1 min-h-0 mt-0 overflow-auto rounded-lg border bg-white data-[state=inactive]:hidden">
            {salesQ.isLoading || subsQ.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Checking customers…</p>
            ) : salesQ.error ? (
              <p className="p-4 text-sm text-destructive">
                Could not load bills: {salesQ.error instanceof Error ? salesQ.error.message : String(salesQ.error)}
              </p>
            ) : notEnabledRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Every customer with a bill in this period has notifications on.</p>
            ) : (
              <>
                <p className="px-3 py-2 text-xs text-muted-foreground border-b">
                  Invite opens WhatsApp with a link to the customer's latest bill. On that page they tap "Turn on notifications".
                </p>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-800">
                    <TableRow>
                      {["Customer", "Phone", "Bills", "Last bill", "Last bill date", ""].map((h, i) => (
                        <TableHead key={i} className="font-bold text-white whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notEnabledRows.map((c) => (
                      <TableRow key={c.phone}>
                        <TableCell className="font-medium">{c.customer_name || "–"}</TableCell>
                        <TableCell className="whitespace-nowrap">{c.phone}</TableCell>
                        <TableCell className="tabular-nums">{c.bills}</TableCell>
                        <TableCell className="whitespace-nowrap">{c.lastSaleNumber || "–"}</TableCell>
                        <TableCell className="whitespace-nowrap">{format(new Date(c.lastSaleDate), "dd-MM-yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={invited.has(c.phone) ? "outline" : "default"}
                            className="h-8 bg-green-600 hover:bg-green-700 text-white data-[invited=true]:bg-white data-[invited=true]:text-green-700"
                            data-invited={invited.has(c.phone)}
                            disabled={inviting === c.phone}
                            onClick={() => void invite(c)}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            {inviting === c.phone ? "Opening…" : invited.has(c.phone) ? "Invited · again" : "Invite on WhatsApp"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </TabsContent>
        </Tabs>
        {messages.length >= MAX_MESSAGES ? (
          <p className="text-xs text-muted-foreground shrink-0">Showing the latest {MAX_MESSAGES} notifications. Narrow the dates to see older ones.</p>
        ) : null}
      </div>
    </div>
  );
}
