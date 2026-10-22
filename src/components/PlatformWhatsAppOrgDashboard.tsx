import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Building2, CalendarClock, CheckCircle, Eye, MessageSquare, Send, Wallet, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  CREDIT_STATE_LABEL,
  creditState,
  formatValidUntil,
  todayIso,
  type WhatsAppCredits,
} from "@/utils/whatsappCredits";

interface Organization {
  id: string;
  name: string;
}

interface OrgStatsRow {
  organization_id: string;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  pending_count: number;
}

interface Props {
  organizations: Organization[];
  orgStats: OrgStatsRow[];
  rangeLabel: string;
  selectedOrgId: string;
  onSelectOrg: (id: string) => void;
  /** True while orgStats still holds the previous period (or nothing yet). */
  statsPending: boolean;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN");

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Wallet;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-2xl font-bold mt-1 truncate ${tone}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
          </div>
          <Icon className={`h-5 w-5 shrink-0 ${tone}`} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Platform admin: cards for one shop (or all) — message balance, used, validity, and period counts. */
export function PlatformWhatsAppOrgDashboard({ organizations, orgStats, rangeLabel, selectedOrgId, onSelectOrg, statsPending }: Props) {
  const { data: credits = [], isError: creditsError, isPending: creditsPending } = useQuery({
    queryKey: ["platform-whatsapp-credits"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_message_credits" as any) as any).select("*");
      if (error) throw error;
      return (data ?? []) as WhatsAppCredits[];
    },
    staleTime: 30_000,
  });

  // "-" while loading or when the balance SQL has not been run yet
  const creditsMissing = creditsError || creditsPending;
  const creditsNote = creditsError ? "Balance SQL not run yet" : creditsPending ? "Loading…" : undefined;
  const period = (n: number) => (statsPending ? "…" : fmt(n));
  const all = selectedOrgId === "all";
  const stats = all
    ? orgStats.reduce(
        (a, s) => ({
          total: a.total + Number(s.total_count),
          sent: a.sent + Number(s.sent_count),
          delivered: a.delivered + Number(s.delivered_count),
          read: a.read + Number(s.read_count),
          failed: a.failed + Number(s.failed_count),
        }),
        { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
      )
    : (() => {
        const s = orgStats.find((o) => o.organization_id === selectedOrgId);
        return {
          total: Number(s?.total_count ?? 0),
          sent: Number(s?.sent_count ?? 0),
          delivered: Number(s?.delivered_count ?? 0),
          read: Number(s?.read_count ?? 0),
          failed: Number(s?.failed_count ?? 0),
        };
      })();

  const credit = all ? null : credits.find((c) => c.organization_id === selectedOrgId) ?? null;
  const state = credit ? creditState(credit) : null;
  const daysLeft = credit?.valid_until ? differenceInCalendarDays(parseISO(credit.valid_until), parseISO(todayIso())) : null;
  const balanceTone = !credit ? "" : state === "active" ? "text-green-600" : state === "low" ? "text-amber-600" : "text-red-600";

  const totalBalance = credits.reduce((a, c) => a + Math.max(0, Number(c.balance)), 0);
  const totalUsed = credits.reduce((a, c) => a + Number(c.used_count), 0);
  const needAttention = credits.filter((c) => creditState(c) !== "active").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Messages for <span className="font-medium text-foreground">{rangeLabel}</span> (change the period in Message Stats below)
        </div>
        <Select value={selectedOrgId} onValueChange={onSelectOrg}>
          <SelectTrigger className="w-[260px]">
            <Building2 className="h-4 w-4 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organizations</SelectItem>
            {organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {all ? (
          <>
            <Tile
              label="Balance left (all shops)"
              value={creditsMissing ? "-" : fmt(totalBalance)}
              sub={creditsNote ?? `${credits.length} shops on balance`}
              icon={Wallet}
              tone="text-green-600"
            />
            <Tile label="Messages used (balance)" value={creditsMissing ? "-" : fmt(totalUsed)} sub="Since balance started" icon={MessageSquare} tone="text-blue-600" />
            <Tile
              label="Shops low / over / expired"
              value={creditsMissing ? "-" : fmt(needAttention)}
              sub="Need a recharge"
              icon={CalendarClock}
              tone={needAttention > 0 ? "text-red-600" : "text-muted-foreground"}
            />
          </>
        ) : (
          <>
            <Tile
              label="Message balance"
              value={credit ? fmt(credit.balance) : creditsMissing ? "-" : "No limit"}
              sub={credit && state ? CREDIT_STATE_LABEL[state] : creditsNote ?? "No balance added"}
              icon={Wallet}
              tone={balanceTone}
            />
            <Tile
              label="Messages used (balance)"
              value={credit ? fmt(credit.used_count) : "-"}
              sub={credit ? `of ${fmt(Number(credit.balance) + Number(credit.used_count))} given` : undefined}
              icon={MessageSquare}
              tone="text-blue-600"
            />
            <Tile
              label="Valid until"
              value={credit ? formatValidUntil(credit.valid_until) : "-"}
              sub={
                daysLeft === null ? undefined : daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : `${daysLeft} days left`
              }
              icon={CalendarClock}
              tone={daysLeft !== null && daysLeft < 0 ? "text-red-600" : daysLeft !== null && daysLeft <= 15 ? "text-amber-600" : ""}
            />
          </>
        )}
        <Tile label="Messages in period" value={period(stats.total)} sub="All WhatsApp sends" icon={MessageSquare} tone="" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Sent" value={period(stats.sent)} icon={Send} tone="text-blue-600" />
        <Tile label="Delivered" value={period(stats.delivered)} icon={CheckCircle} tone="text-green-600" />
        <Tile label="Read" value={period(stats.read)} icon={Eye} tone="text-emerald-600" />
        <Tile label="Failed" value={period(stats.failed)} icon={XCircle} tone="text-red-600" />
      </div>
    </div>
  );
}
