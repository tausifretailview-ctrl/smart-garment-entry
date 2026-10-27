import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LinkAlert {
  organizationId: string;
  organizationName: string;
  integrationOn: boolean;
  status: string;
  since: string | null;
  reason: string | null;
  closeCode: number | null;
  lastNumber: string | null;
  failedWaiting: number;
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: "Disconnected",
  logged_out: "Unlinked",
  connecting: "Reconnecting",
  qr: "Waiting for QR scan",
};

/**
 * Platform Admin: shops on Ezzy ERP WhatsApp whose link is down right now. Shown above the tabs so a drop
 * is seen without opening anything; a new drop also pops a toast while the page is open.
 */
export function PlatformWhatsAppLinkAlerts() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["platform-whatsapp-link-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-gateway-proxy", {
        body: { action: "platform-link-alerts" },
      });
      if (error) throw error;
      return data as { success: boolean; gatewayReachable?: boolean; alerts?: LinkAlert[]; error?: string };
    },
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const alerts = data?.alerts ?? [];
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data?.success) return;
    const ids = new Set(alerts.map((a) => a.organizationId));
    if (seen.current) {
      for (const a of alerts) {
        if (!seen.current.has(a.organizationId)) toast.warning(`WhatsApp unlinked: ${a.organizationName}`);
      }
    }
    seen.current = ids;
  }, [data, alerts]);

  if (!data?.success || (!alerts.length && data.gatewayReachable !== false)) return null;

  return (
    <Card className="border-red-300 bg-red-50/60 dark:bg-red-950/20">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
            <Unlink className="h-4 w-4" />
            {data.gatewayReachable === false
              ? "Ezzy ERP WhatsApp server is not answering"
              : `Ezzy ERP WhatsApp not linked: ${alerts.length} shop${alerts.length === 1 ? "" : "s"}`}
          </CardTitle>
          <CardDescription>
            Bills to these shops' customers fail until the shop scans the QR again (Settings → WhatsApp). Bills that
            failed in the last 24 hours are sent again by themselves, one by one, after the link is back.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      {alerts.length > 0 && (
        <CardContent className="space-y-2">
          {alerts.map((a) => (
            <div key={a.organizationId} className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-background p-2 text-sm">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {a.organizationName}
                  <Badge variant="destructive">{STATUS_LABELS[a.status] ?? a.status}</Badge>
                  {!a.integrationOn && <Badge variant="outline">Integration off</Badge>}
                  {a.lastNumber && <span className="text-xs text-muted-foreground">+{a.lastNumber}</span>}
                </div>
                {a.reason && (
                  <p className="text-xs text-muted-foreground">
                    {a.reason}
                    {a.closeCode ? ` (code ${a.closeCode})` : ""}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {a.since && <div>since {formatDistanceToNow(new Date(a.since), { addSuffix: true })}</div>}
                {a.failedWaiting > 0 && (
                  <div className="font-medium text-red-700 dark:text-red-400">{a.failedWaiting} failed bill messages waiting</div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
