import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, Edit, Loader2, MessageCircle, Plus, RefreshCw, Search, UserPlus, Users, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { callBulkWhatsApp, db } from "@/components/bulk-whatsapp/bulkWhatsAppApi";

export interface WhatsAppShopOrg {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  is_suspended?: boolean | null;
}

export interface WhatsAppShopMember {
  organization_id: string;
  user_id: string;
  role: string;
  user_email?: string;
}

interface ShopActivity {
  organization_id: string;
  campaigns_total: number;
  campaigns_running: number;
  last_campaign_at: string | null;
  last_campaign_name: string | null;
  last_campaign_status: string | null;
  last_sender_number: string | null;
  sent_30d: number;
  failed_30d: number;
  chats_total: number;
  unread_total: number;
  last_reply_at: string | null;
  optouts_total: number;
}

interface UserLink {
  userId: string;
  status: string;
  connectedNumber: string | null;
  error?: string;
}

interface Props {
  shops: WhatsAppShopOrg[];
  members: WhatsAppShopMember[];
  loading: boolean;
  siteUrl: string;
  onCreate: () => void;
  onCreateUser: (orgId: string) => void;
  onAssignUser: (orgId: string) => void;
  onEditFeatures: (orgId: string) => void;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never";

const fmtPhone = (n: string | null) => (n ? `+${n.replace(/\D/g, "")}` : null);

function LinkBadge({ link }: { link: UserLink }) {
  if (link.status === "connected") {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="h-3 w-3" /> Linked{link.connectedNumber ? ` ${fmtPhone(link.connectedNumber)}` : ""}
      </span>
    );
  }
  if (link.status === "unknown") {
    return <span className="text-xs text-amber-700" title={link.error}>Server not reachable</span>;
  }
  if (link.status === "qr" || link.status === "connecting") {
    return <span className="text-xs text-amber-700">Linking…</span>;
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <XCircle className="h-3 w-3" /> Not linked
    </span>
  );
}

function ShopCard({
  shop,
  members,
  activity,
  activityReady,
  siteUrl,
  onCreateUser,
  onAssignUser,
  onEditFeatures,
}: {
  shop: WhatsAppShopOrg;
  members: WhatsAppShopMember[];
  activity: ShopActivity | undefined;
  activityReady: boolean;
  siteUrl: string;
  onCreateUser: (orgId: string) => void;
  onAssignUser: (orgId: string) => void;
  onEditFeatures: (orgId: string) => void;
}) {
  const [links, setLinks] = useState<Record<string, UserLink> | null>(null);
  const [checking, setChecking] = useState(false);

  const loginLink = siteUrl ? `${siteUrl}/${shop.slug}` : "";

  const checkLinks = async () => {
    setChecking(true);
    try {
      const res = await callBulkWhatsApp<{ users?: UserLink[] }>(shop.id, "platform-link-status");
      setLinks(Object.fromEntries((res.users ?? []).map((u) => [u.userId, u])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check WhatsApp link");
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="truncate">{shop.name}</span>
          <div className="flex shrink-0 items-center gap-1">
            {shop.is_suspended && <Badge variant="destructive">Suspended</Badge>}
            {activity && activity.campaigns_running > 0 && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Sending</Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>Created {new Date(shop.created_at).toLocaleDateString()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-muted-foreground">Login:</span>
          {loginLink ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 font-mono text-xs font-medium text-emerald-700 hover:underline"
              title="Copy login link"
              onClick={() => {
                void navigator.clipboard?.writeText(loginLink).then(
                  () => toast.success("Login link copied"),
                  () => toast.message(loginLink),
                );
              }}
            >
              <span className="truncate">{loginLink.replace(/^https?:\/\//, "")}</span>
              <Copy className="h-3 w-3 shrink-0" />
            </button>
          ) : (
            <span className="font-mono text-xs font-medium">/{shop.slug}</span>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Users ({members.length}):</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={checkLinks} disabled={checking || members.length === 0}>
              {checking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Check WhatsApp link
            </Button>
          </div>
          {members.length === 0 ? (
            <p className="text-xs text-amber-700">No user yet. Assign one so the shop can log in.</p>
          ) : (
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1">
                  <span className="min-w-0 truncate text-xs">
                    {m.user_email || "Unknown"} <span className="text-muted-foreground">({m.role})</span>
                  </span>
                  {links?.[m.user_id] && <LinkBadge link={links[m.user_id]} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {activityReady ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded border p-2 text-xs">
            <span className="text-muted-foreground">Campaigns</span>
            <span className="text-right font-medium">{activity?.campaigns_total ?? 0}</span>
            <span className="text-muted-foreground">Sent (30 days)</span>
            <span className="text-right font-medium">
              {activity?.sent_30d ?? 0}
              {activity && activity.failed_30d > 0 && <span className="text-destructive"> · {activity.failed_30d} failed</span>}
            </span>
            <span className="text-muted-foreground">Last campaign</span>
            <span className="truncate text-right font-medium" title={activity?.last_campaign_name ?? undefined}>
              {fmtDate(activity?.last_campaign_at ?? null)}
            </span>
            <span className="text-muted-foreground">Sent from</span>
            <span className="text-right font-mono">{fmtPhone(activity?.last_sender_number ?? null) ?? "-"}</span>
            <span className="text-muted-foreground">Inbox chats</span>
            <span className="text-right font-medium">
              {activity?.chats_total ?? 0}
              {activity && activity.unread_total > 0 && <span className="text-emerald-700"> · {activity.unread_total} unread</span>}
            </span>
            <span className="text-muted-foreground">Unsubscribed</span>
            <span className="text-right font-medium">{activity?.optouts_total ?? 0}</span>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onCreateUser(shop.id)}>
            <UserPlus className="mr-1 h-3 w-3" />
            New User
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onAssignUser(shop.id)}>
            <Users className="mr-1 h-3 w-3" />
            Assign User
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEditFeatures(shop.id)} title="Edit features">
            <Edit className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Platform Admin tab for WhatsApp-only shops (the separate Bulk WhatsApp site, no ERP). */
export function PlatformWhatsAppShops({
  shops,
  members,
  loading,
  siteUrl,
  onCreate,
  onCreateUser,
  onAssignUser,
  onEditFeatures,
}: Props) {
  const [search, setSearch] = useState("");

  const { data: activityRows, isError: activityMissing } = useQuery({
    queryKey: ["platform-whatsapp-shop-activity"],
    queryFn: async () => {
      const { data, error } = await db.rpc("platform_whatsapp_shop_activity");
      if (error) throw error;
      return (data ?? []) as ShopActivity[];
    },
    retry: false,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const activityByOrg = useMemo(
    () => new Map((activityRows ?? []).map((a) => [a.organization_id, a])),
    [activityRows],
  );

  const membersByOrg = useMemo(() => {
    const map = new Map<string, WhatsAppShopMember[]>();
    for (const m of members) {
      const list = map.get(m.organization_id);
      if (list) list.push(m);
      else map.set(m.organization_id, [m]);
    }
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (membersByOrg.get(s.id) ?? []).some((m) => (m.user_email || "").toLowerCase().includes(q)),
    );
  }, [shops, search, membersByOrg]);

  const totals = useMemo(() => {
    const rows = activityRows ?? [];
    return {
      sending: rows.filter((r) => r.campaigns_running > 0).length,
      sent30: rows.reduce((sum, r) => sum + Number(r.sent_30d || 0), 0),
    };
  }, [activityRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            WhatsApp Only Shops
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shops.length} shop{shops.length === 1 ? "" : "s"}
            {activityRows ? ` · ${totals.sending} sending now · ${totals.sent30} messages sent in 30 days` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, slug, email…" className="pl-9" />
          </div>
          <Button onClick={onCreate} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="mr-2 h-4 w-4" />
            Create WhatsApp Shop
          </Button>
        </div>
      </div>

      {activityMissing && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sending activity is not available yet. Run the WhatsApp shop activity SQL once to show campaigns, sent counts and inbox for each shop.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          {search.trim() ? "No WhatsApp shops match your search" : "No WhatsApp-only shops yet"}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              members={membersByOrg.get(shop.id) ?? []}
              activity={activityByOrg.get(shop.id)}
              activityReady={!!activityRows}
              siteUrl={siteUrl}
              onCreateUser={onCreateUser}
              onAssignUser={onAssignUser}
              onEditFeatures={onEditFeatures}
            />
          ))}
        </div>
      )}
    </div>
  );
}
