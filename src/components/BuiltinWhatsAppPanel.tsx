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
import { WhatsAppLinkMethods, type LinkMethod } from "@/components/whatsapp/WhatsAppLinkMethods";
import { WhatsAppMessageBalance } from "@/components/whatsapp/WhatsAppMessageBalance";
import { BillCustomerGroupSettings } from "@/components/whatsapp/BillCustomerGroupSettings";

type GatewayStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out";

interface ControlResponse {
  success?: boolean;
  status?: GatewayStatus;
  qr?: string | null;
  pairingCode?: string | null;
  connectedNumber?: string | null;
  /** Other shops where this same phone number is linked too. */
  sharedWith?: string[];
  error?: string;
}

const POLL_MS = 3000;

const STATUS_LABELS: Record<GatewayStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  qr: "Waiting for scan or code",
  disconnected: "Not connected",
  logged_out: "Not connected",
};

/** "Ezzy ERP WhatsApp" setup: link the shop's own number by scanning a QR (no third-party service). */
export function BuiltinWhatsAppPanel({ lastStatus }: { lastStatus?: string | null }) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [method, setMethod] = useState<LinkMethod>("qr");
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useCallback(
    async (action: "start" | "status" | "logout", phone?: string): Promise<ControlResponse> => {
      const { data, error } = await supabase.functions.invoke("whatsapp-gateway-proxy", {
        body: { action, organizationId: orgId, ...(phone ? { phone } : {}) },
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error, data, "Gateway request failed"));
      return (data ?? {}) as ControlResponse;
    },
    [orgId],
  );

  const apply = useCallback((res: ControlResponse) => {
    setStatus(res.status ?? null);
    setQr(res.qr ?? null);
    setPairingCode(res.pairingCode ?? null);
    setNumber(res.connectedNumber ?? null);
    setSharedWith(res.sharedWith ?? []);
  }, []);

  /**
   * Linking the number means this shop sends through Ezzy ERP WhatsApp: save the provider first,
   * so the settings reload below doesn't put the dropdown back on the old saved provider.
   */
  const onLinked = useCallback(async () => {
    if (orgId) {
      const { error } = await supabase.rpc("set_whatsapp_send_provider", {
        p_organization_id: orgId,
        p_send_provider: "builtin",
      });
      if (error) console.warn("set_whatsapp_send_provider failed:", error);
    }
    await queryClient.invalidateQueries({ queryKey: ["whatsapp-api-settings"] });
  }, [orgId, queryClient]);

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
        if (res.status === "connected" || res.status === "logged_out" || res.status === "disconnected") {
          setPolling(false);
          if (res.status === "connected") {
            toast.success("WhatsApp linked");
            void onLinked();
          }
          // The server stops making QR codes after a while without a scan.
          else toast.info("The QR code / link code expired. Get a new one to try again.");
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
  }, [polling, orgId, call, apply, onLinked]);

  const run = async (action: "start" | "logout", phone?: string) => {
    setBusy(true);
    try {
      const res = await call(action, phone);
      if (action === "logout") {
        setStatus("logged_out");
        setQr(null);
        setPairingCode(null);
        setNumber(null);
        setPolling(false);
        void queryClient.invalidateQueries({ queryKey: ["whatsapp-api-settings"] });
        toast.success("WhatsApp disconnected");
      } else {
        apply(res);
        setPolling(res.status !== "connected");
        if (res.status === "connected") void onLinked();
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
      <WhatsAppMessageBalance />
      <Alert>
        <Smartphone className="h-4 w-4" />
        <AlertTitle>Ezzy ERP WhatsApp — send from your own number</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <p>
            Click Connect WhatsApp, then on the shop phone open WhatsApp → Settings → Linked devices → Link a
            device and scan the QR below (or use Link with phone number to type a code instead). Bills, reminders and offers then go from your own number.
          </p>
          <p className="text-xs text-muted-foreground">
            After it shows Connected, turn the integration on and click Save Settings so sends use it.
          </p>
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Use responsibly</AlertTitle>
        <AlertDescription className="text-xs">
          Ezzy ERP WhatsApp links through WhatsApp Web (unofficial), like WappConnect. WhatsApp may restrict or ban
          numbers used for bulk messaging or spam. Messages are spaced a few seconds apart and capped per day to
          lower that risk. For fully compliant business messaging, use the Meta WhatsApp Business API.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={connected ? "default" : "secondary"}>
          {connected ? `Connected${number ? ` · +${number}` : ""}` : status ? STATUS_LABELS[status] ?? status : "Checking…"}
        </Badge>
        {!connected && (
          <Button
            type="button"
            size="sm"
            disabled={busy || !orgId}
            onClick={() => {
              setMethod("qr");
              void run("start");
            }}
          >
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
      {connected && sharedWith.length > 0 && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>This number is also linked in {sharedWith.join(", ")}</AlertTitle>
          <AlertDescription className="text-xs">
            Both shops send from the same WhatsApp number, so they share its daily limit and ban risk, customer
            replies reach both shops, and it uses two of the phone's 4 linked devices. Use a separate number per
            shop if you can.
          </AlertDescription>
        </Alert>
      )}
      {!connected && !qr && lastStatus && status !== "connecting" && (
        <p className="text-xs text-muted-foreground">Last known status: {lastStatus}</p>
      )}

      {connected && <BillCustomerGroupSettings />}

      {!connected && status && orgId && (
        <WhatsAppLinkMethods
          method={method}
          onMethodChange={setMethod}
          qr={qr}
          pairingCode={pairingCode}
          busy={busy}
          onRequestCode={(phone) => void run("start", phone)}
          qrHint="Click Connect WhatsApp to get the QR code, or link with the shop's phone number instead."
        />
      )}
    </div>
  );
}
