import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, MessageCircle, QrCode, RefreshCw, Send, Ticket, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsAppLinkMethods, type LinkMethod } from "@/components/whatsapp/WhatsAppLinkMethods";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
  invokeSupportTokens,
  supportTokensTable,
  type SupportToken,
  type SupportTokenStatus,
} from "@/components/support/supportTokensApi";
import { supportPhoneDigits } from "../../supabase/functions/_shared/supportTokenMessage";

type SessionStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out" | "unreachable";

interface SupportConfig {
  configured: boolean;
  session: {
    status?: SessionStatus;
    qr?: string | null;
    pairingCode?: string | null;
    connectedNumber?: string | null;
    error?: string;
  } | null;
  group: { jid: string | null; name: string | null };
}

interface GatewayGroup {
  id: string;
  name: string;
  size: number;
}

const SESSION_LABELS: Record<SessionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  qr: "Waiting for scan or code",
  disconnected: "Not connected",
  logged_out: "Not connected",
  unreachable: "WhatsApp server not reachable",
};

const STATUS_VARIANT: Record<SupportTokenStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  in_progress: "secondary",
  closed: "outline",
};

type Filter = "active" | "closed" | "all";

const POLL_MS = 3000;

/** Platform Admin > Support Tokens: link Ezzy's support number, pick the group, and work the token list. */
export function PlatformSupportTokens() {
  return (
    <div className="space-y-4">
      <SupportWhatsAppSetup />
      <SupportTokenList />
    </div>
  );
}

function SupportWhatsAppSetup() {
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<LinkMethod>("qr");
  const [polling, setPolling] = useState(false);
  const [groups, setGroups] = useState<GatewayGroup[] | null>(null);
  const [groupJid, setGroupJid] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await invokeSupportTokens<SupportConfig>("admin-config");
      setConfig(res);
      setGroupJid((cur) => cur || res.group.jid || "");
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load support settings");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      const res = await load();
      const st = res?.session?.status;
      if (st === "connected" || st === "disconnected" || st === "logged_out") {
        setPolling(false);
        if (st === "connected") toast.success("Support WhatsApp linked");
        else toast.info("The QR code / link code expired. Get a new one to try again.");
        return;
      }
      timer.current = setTimeout(tick, POLL_MS);
    };
    timer.current = setTimeout(tick, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [polling, load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const start = (phone?: string) =>
    run(async () => {
      const res = await invokeSupportTokens<NonNullable<SupportConfig["session"]>>("admin-start", phone ? { phone } : {});
      setConfig((c) => (c ? { ...c, session: res } : c));
      setPolling(res.status !== "connected");
    });

  const logout = () =>
    run(async () => {
      await invokeSupportTokens("admin-logout");
      setGroups(null);
      toast.success("Support WhatsApp disconnected");
      await load();
    });

  const loadGroups = () =>
    run(async () => {
      const res = await invokeSupportTokens<{ groups: GatewayGroup[] }>("admin-groups");
      setGroups(res.groups ?? []);
      if (!res.groups?.length) toast.info("This number is not in any WhatsApp group yet");
    });

  const saveGroup = () =>
    run(async () => {
      const g = groups?.find((x) => x.id === groupJid);
      await invokeSupportTokens("admin-save-group", { jid: groupJid, name: g?.name ?? config?.group.name ?? "" });
      toast.success("Support group saved");
      await load();
    });

  const sendTest = () =>
    run(async () => {
      await invokeSupportTokens("admin-test");
      toast.success("Test message sent to the group");
    });

  const session = config?.session;
  const status = session?.status;
  const connected = status === "connected";
  const groupOptions = useMemo(() => {
    const list = groups ?? [];
    const saved = config?.group.jid;
    if (saved && !list.some((g) => g.id === saved)) {
      return [{ id: saved, name: config?.group.name || saved, size: 0 }, ...list];
    }
    return list;
  }, [groups, config?.group]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5" /> Technical Support WhatsApp group
        </CardTitle>
        <CardDescription>
          Every new support token is posted to this group from Ezzy's own number. Link a number that is a member of
          the Technical Support group, then pick the group.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : !config?.configured ? (
          <p className="text-sm text-destructive">
            The WhatsApp server is not set up (Supabase secrets WA_GATEWAY_URL / WA_GATEWAY_KEY).
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={connected ? "default" : "secondary"}>
                {connected
                  ? `Connected${session?.connectedNumber ? ` · +${session.connectedNumber}` : ""}`
                  : status
                    ? SESSION_LABELS[status] ?? status
                    : "Not connected"}
              </Badge>
              {!connected && status !== "unreachable" && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setMethod("qr");
                    void start();
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                  {session?.qr ? "Refresh QR" : "Link support number"}
                </Button>
              )}
              {connected && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Disconnect
                </Button>
              )}
            </div>
            {status === "unreachable" && session?.error && (
              <p className="text-sm text-destructive">{session.error}</p>
            )}

            {!connected && status && status !== "unreachable" && status !== "connecting" && (
              <WhatsAppLinkMethods
                method={method}
                onMethodChange={setMethod}
                qr={session?.qr ?? null}
                pairingCode={session?.pairingCode ?? null}
                busy={busy}
                onRequestCode={(phone) => void start(phone)}
                qrHint="Click Link support number to get the QR code, then scan it from WhatsApp → Linked devices on the support phone."
              />
            )}

            {connected && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void loadGroups()}>
                  <Users className="h-4 w-4 mr-2" /> {groups ? "Reload groups" : "Load my groups"}
                </Button>
                {groupOptions.length > 0 && (
                  <Select value={groupJid} onValueChange={setGroupJid}>
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Pick the support group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                          {g.size ? ` (${g.size})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !groupJid || groupJid === config.group.jid}
                  onClick={() => void saveGroup()}
                >
                  Save group
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !config.group.jid}
                  onClick={() => void sendTest()}
                >
                  <Send className="h-4 w-4 mr-2" /> Send test
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Saved group: {config.group.jid ? config.group.name || config.group.jid : "none yet"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SupportTokenList() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [closing, setClosing] = useState<SupportToken | null>(null);
  const [note, setNote] = useState("");

  const { data: tokens = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["platform-support-tokens", filter],
    queryFn: async (): Promise<SupportToken[]> => {
      let q = supportTokensTable().select("*").order("created_at", { ascending: false }).limit(300);
      if (filter === "active") q = q.neq("status", "closed");
      if (filter === "closed") q = q.eq("status", "closed");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SupportToken[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: string; status: SupportTokenStatus; adminNote?: string }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status, updated_at: now, closed_at: status === "closed" ? now : null };
      if (adminNote !== undefined) patch.admin_note = adminNote || null;
      const { error } = await supportTokensTable().update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-support-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resend = useMutation({
    mutationFn: (id: string) => invokeSupportTokens("admin-resend", { tokenId: id }),
    onSuccess: () => {
      toast.success("Sent to the support group");
      void queryClient.invalidateQueries({ queryKey: ["platform-support-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tokens;
    return tokens.filter((t) =>
      [String(t.token_no), t.organization_name, t.user_name, t.user_email, t.contact_phone, t.message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [tokens, search]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" /> Support tokens
          </CardTitle>
          <CardDescription>Raised by shops from Contact Support → Generate Support Token.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search token, shop, phone…"
            className="h-9 w-56"
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Open + In progress</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Could not load tokens: {(error as Error).message}. Has the support tokens SQL been run?
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens here.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Shop / user</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="min-w-64">Issue</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((t) => {
                  const digits = supportPhoneDigits(t.contact_phone);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-bold">#{t.token_no}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(t.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        <p className="font-medium">{t.organization_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{t.user_name || t.user_email}</p>
                        {digits ? (
                          <a
                            href={`https://wa.me/${digits}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-700 hover:underline"
                          >
                            +{digits}
                          </a>
                        ) : (
                          <p className="text-xs">{t.contact_phone}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{SUPPORT_CATEGORIES[t.category] ?? t.category}</TableCell>
                      <TableCell className="text-sm">
                        <p className="whitespace-pre-wrap break-words">{t.message}</p>
                        {t.page_path ? <p className="text-xs text-muted-foreground mt-1">Screen: {t.page_path}</p> : null}
                        {t.admin_note ? <p className="text-xs text-emerald-700 mt-1">Note: {t.admin_note}</p> : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.whatsapp_status === "sent" ? (
                          <span className="text-emerald-700">Sent</span>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-destructive" title={t.whatsapp_error ?? undefined}>
                              {t.whatsapp_status === "pending" ? "Pending" : "Not sent"}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={resend.isPending}
                              onClick={() => resend.mutate(t.id)}
                            >
                              Resend
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5 items-start">
                          <Badge variant={STATUS_VARIANT[t.status] ?? "default"}>
                            {SUPPORT_STATUS_LABELS[t.status] ?? t.status}
                          </Badge>
                          {t.status === "open" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={update.isPending}
                              onClick={() => update.mutate({ id: t.id, status: "in_progress" })}
                            >
                              Start
                            </Button>
                          )}
                          {t.status !== "closed" ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setClosing(t);
                                setNote(t.admin_note ?? "");
                              }}
                            >
                              Close
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={update.isPending}
                              onClick={() => update.mutate({ id: t.id, status: "open" })}
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={closing !== null} onOpenChange={(o) => !o && setClosing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close token #{closing?.token_no}</DialogTitle>
            <DialogDescription>The shop sees this note under My support tokens.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done, e.g. Printer driver reinstalled on call"
            rows={3}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClosing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={update.isPending}
              onClick={() => {
                if (!closing) return;
                update.mutate(
                  { id: closing.id, status: "closed", adminNote: note.trim() },
                  { onSuccess: () => setClosing(null) },
                );
              }}
            >
              Close token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
