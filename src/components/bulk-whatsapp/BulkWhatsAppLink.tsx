import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import { callBulkWhatsApp, type LinkStatus } from "./bulkWhatsAppApi";

interface LinkResponse {
  status?: LinkStatus;
  qr?: string | null;
  connectedNumber?: string | null;
}

const POLL_MS = 3000;

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
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback(
    (res: LinkResponse) => {
      setStatus(res.status ?? null);
      setQr(res.qr ?? null);
      setNumber(res.connectedNumber ?? null);
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
          toast.info("QR code expired. Click Link my WhatsApp to get a new one.");
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

  const run = async (action: "session-start" | "session-logout") => {
    setBusy(true);
    try {
      const res = await callBulkWhatsApp<LinkResponse>(organizationId, action);
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
                ? "Waiting for scan"
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
            <Button type="button" size="sm" disabled={busy} onClick={() => void run("session-start")}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
              {qr ? "Refresh QR" : "Link my WhatsApp"}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!connected && qr && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="rounded-md border bg-white p-2">
            <img src={qr} alt="WhatsApp link QR code" className="h-52 w-52" />
          </div>
          <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1 max-w-sm">
            <li>Open WhatsApp on your phone</li>
            <li>Tap Settings (or ⋮) → Linked devices → Link a device</li>
            <li>Scan this QR code</li>
          </ol>
        </div>
      )}
    </div>
  );
}
