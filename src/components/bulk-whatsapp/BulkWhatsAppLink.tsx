import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, LogOut, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import { WhatsAppLinkMethods, type LinkMethod } from "@/components/whatsapp/WhatsAppLinkMethods";
import { callBulkWhatsApp, type LinkStatus } from "./bulkWhatsAppApi";

interface LinkResponse {
  status?: LinkStatus;
  qr?: string | null;
  pairingCode?: string | null;
  connectedNumber?: string | null;
  /** Why WhatsApp last dropped this number (null while linked). */
  lastDisconnect?: { code: number | null; reason: string; at: string } | null;
}

const POLL_MS = 3000;
/** While not linking: notice a drop (or the automatic reconnect) without reloading the page. */
const WATCH_MS = 30_000;

/** The logged-in user's own WhatsApp for bulk sends (separate from the shop's bill number). */
export function BulkWhatsAppLink({
  organizationId,
  onChange,
}: {
  organizationId: string;
  onChange: (connected: boolean) => void;
}) {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [method, setMethod] = useState<LinkMethod>("qr");
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [drop, setDrop] = useState<LinkResponse["lastDisconnect"]>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback(
    (res: LinkResponse) => {
      setStatus(res.status ?? null);
      setQr(res.qr ?? null);
      setPairingCode(res.pairingCode ?? null);
      setNumber(res.connectedNumber ?? null);
      setDrop(res.status === "connected" ? null : res.lastDisconnect ?? null);
      onChange(res.status === "connected");
    },
    [onChange],
  );

  useEffect(() => {
    callBulkWhatsApp<LinkResponse>(organizationId, "session-status")
      .then((res) => {
        apply(res);
        setError(null);
        // Already showing a QR from an earlier visit: keep watching for the scan.
        if (res.status === "qr" || res.status === "connecting") setPolling(true);
      })
      .catch((e: unknown) => {
        setStatus("disconnected");
        setError(e instanceof Error ? e.message : "WhatsApp server not reachable");
      });
  }, [organizationId, apply]);

  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      try {
        const res = await callBulkWhatsApp<LinkResponse>(organizationId, "session-status");
        apply(res);
        if (res.status === "connected") {
          setPolling(false);
          toast.success("WhatsApp linked");
          return;
        }
        if (res.status === "logged_out" || res.status === "disconnected") {
          setPolling(false);
          toast.info("The QR code / link code expired. Get a new one to try again.");
          return;
        }
      } catch {
        /* keep polling */
      }
      timer.current = setTimeout(() => void tick(), POLL_MS);
    };
    timer.current = setTimeout(() => void tick(), POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [polling, organizationId, apply]);

  useEffect(() => {
    if (polling || !status || status === "qr") return;
    const id = setInterval(() => {
      callBulkWhatsApp<LinkResponse>(organizationId, "session-status")
        .then(apply)
        .catch(() => undefined);
    }, WATCH_MS);
    return () => clearInterval(id);
  }, [polling, status, organizationId, apply]);

  const run = async (action: "session-start" | "session-logout", phone?: string) => {
    setBusy(true);
    try {
      const res = await callBulkWhatsApp<LinkResponse>(organizationId, action, phone ? { phone } : {});
      if (action === "session-logout") {
        apply({ status: "logged_out" });
        setPolling(false);
        toast.success("WhatsApp unlinked");
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
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
            )}
          >
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <div className="text-base font-semibold leading-tight text-slate-900">My WhatsApp</div>
            <div className="text-xs text-slate-500">Bulk messages go from the number you link here</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={connected ? "default" : "secondary"}
            className={cn("px-2.5 py-1 text-xs", connected && "bg-emerald-600 hover:bg-emerald-600")}
          >
            {connected
              ? `Linked${number ? ` · ${formatBulkPhone(number)}` : ""}`
              : status === "qr"
                ? pairingCode
                  ? "Waiting for code"
                  : "Waiting for scan"
                : status === "connecting"
                  ? "Connecting…"
                  : status
                    ? "Not linked"
                    : "Checking…"}
          </Badge>
          {connected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void run("session-logout")}
            >
              <LogOut className="h-4 w-4 mr-1" /> Unlink
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                setMethod("qr");
                void run("session-start");
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
              {qr ? "Refresh QR" : "Link my WhatsApp"}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!connected && drop && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <b>Disconnected at {format(new Date(drop.at), "dd MMM, hh:mm a")}:</b> {drop.reason}
        </p>
      )}
      {!connected && status && (
        <WhatsAppLinkMethods
          method={method}
          onMethodChange={setMethod}
          qr={qr}
          pairingCode={pairingCode}
          busy={busy}
          onRequestCode={(phone) => void run("session-start", phone)}
          qrHint="Click Link my WhatsApp to get the QR code, or link with your phone number instead."
        />
      )}
    </div>
  );
}
