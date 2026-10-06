import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, QrCode, ShieldAlert, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";

type GatewayStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out";

interface ControlResponse {
  success?: boolean;
  status?: GatewayStatus;
  qr?: string | null;
  connectedNumber?: string | null;
  error?: string;
}

const POLL_MS = 3000;

/** "Our WhatsApp" setup: link the shop's own number by scanning a QR (no third-party service). */
export function BuiltinWhatsAppPanel({ lastStatus }: { lastStatus?: string | null }) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useCallback(
    async (action: "start" | "status" | "logout"): Promise<ControlResponse> => {
      const { data, error } = await supabase.functions.invoke("whatsapp-gateway-proxy", {
        body: { action, organizationId: orgId },
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error, data, "Gateway request failed"));
      return (data ?? {}) as ControlResponse;
    },
    [orgId],
  );

  const apply = useCallback(
    (res: ControlResponse) => {
      setStatus(res.status ?? null);
      setQr(res.qr ?? null);
      setNumber(res.connectedNumber ?? null);
      if (res.status === "connected") {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-api-settings"] });
      }
    },
    [queryClient],
  );

  // Initial status
  useEffect(() => {
    if (!orgId) return;
    call("status").then(apply).catch(() => setStatus("disconnected"));
  }, [orgId, call, apply]);

  // Poll while waiting for the scan
  useEffect(() => {
    if (!polling || !orgId) return;
    const tick = async () => {
      try {
        const res = await call("status");
        apply(res);
        if (res.status === "connected" || res.status === "logged_out") {
          setPolling(false);
          if (res.status === "connected") toast.success("WhatsApp linked");
          return;
        }
      } catch {
        /* keep polling */
      }
      timer.current = setTimeout(tick, POLL_MS);
    };
    timer.current = setTimeout(tick, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [polling, orgId, call, apply]);

  const run = async (action: "start" | "logout") => {
    setBusy(true);
    try {
      const res = await call(action);
      if (action === "logout") {
        setStatus("logged_out");
        setQr(null);
        setNumber(null);
        setPolling(false);
        queryClient.invalidateQueries({ queryKey: ["whatsapp-api-settings"] });
        toast.success("WhatsApp disconnected");
      } else {
        apply(res);
        setPolling(res.status !== "connected");
      }
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const connected = status === "connected";

  return (
    <div className="space-y-4">
      <Alert>
        <Smartphone className="h-4 w-4" />
        <AlertTitle>Our WhatsApp — send from your own number</AlertTitle>
        <AlertDescription className="text-sm">
          Open WhatsApp on the shop phone → Settings → Linked devices → Link a device, then scan the QR below.
          Messages are sent directly from your number — no Meta API or third-party service needed.
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Use responsibly</AlertTitle>
        <AlertDescription className="text-xs">
          ⚠️ Our WhatsApp uses the unofficial WhatsApp Web protocol. WhatsApp may restrict or ban numbers used for
          bulk messaging or spam. For compliant business messaging, Meta WhatsApp Cloud API is recommended.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={connected ? "default" : "secondary"}>
          {connected ? `Connected${number ? ` · +${number}` : ""}` : (status ?? "checking…")}
        </Badge>
        {!connected && (
          <Button type="button" size="sm" disabled={busy || !orgId} onClick={() => void run("start")}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
            {qr ? "Refresh QR" : "Connect WhatsApp"}
          </Button>
        )}
        {connected && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => void run("logout")}
          >
            <LogOut className="h-4 w-4 mr-2" /> Disconnect
          </Button>
        )}
      </div>

      {status === "connecting" && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
        </p>
      )}
      {error && <p className="text-sm text-destructive">Connection error: {error}</p>}
      {!connected && !qr && lastStatus && status !== "connecting" && (
        <p className="text-xs text-muted-foreground">Last known status: {lastStatus}</p>
      )}

      {!connected && qr && (
        <div className="inline-block rounded-md border bg-white p-3">
          <img src={qr} alt="WhatsApp link QR code" className="h-56 w-56" />
          <p className="mt-2 text-center text-xs text-muted-foreground">Waiting for scan…</p>
        </div>
      )}
    </div>
  );
}
