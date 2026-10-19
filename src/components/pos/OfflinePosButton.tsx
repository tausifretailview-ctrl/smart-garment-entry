import { useSyncExternalStore } from "react";
import { format } from "date-fns";
import { Cloud, CloudOff, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  OFFLINE_POS_SYNC_NOW_EVENT,
  getOfflinePosSnapshot,
  refreshOfflineCatalog,
  setOfflinePosEnabled,
  subscribeOfflinePos,
} from "@/lib/offlinePos/offlinePosStore";

const money = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** POS header button: offline billing switch, saved item list and bills waiting to be sent. */
export function OfflinePosButton({ className }: { className?: string }) {
  const snap = useSyncExternalStore(subscribeOfflinePos, getOfflinePosSnapshot);
  const orgId = snap.organizationId;
  if (!orgId) return null;

  const waiting = snap.bills.length;
  const offlineNow = snap.networkDown;
  const label = offlineNow ? (snap.enabled ? "Offline billing" : "No internet") : waiting > 0 ? "Sending" : "Offline";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            className,
            offlineNow && "bg-amber-500 text-white hover:bg-amber-600",
          )}
          title="Offline billing"
        >
          {offlineNow ? <CloudOff className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
          <span className={cn(offlineNow || waiting > 0 ? "inline" : "hidden xl:inline")}>{label}</span>
          {waiting > 0 && (
            <span className="ml-1 rounded-full bg-white/90 px-1.5 text-xs font-semibold text-amber-700">
              {waiting}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Offline billing</p>
            <p className="text-xs text-muted-foreground">
              Keep billing cash, UPI and card bills on this computer when the internet drops.
            </p>
          </div>
          <Switch
            checked={snap.enabled}
            onCheckedChange={(on) => setOfflinePosEnabled(orgId, on)}
            aria-label="Offline billing on this computer"
          />
        </div>

        <p className={cn("text-xs font-medium", offlineNow ? "text-amber-600" : "text-emerald-600")}>
          {offlineNow ? "No internet right now" : "Internet connected"}
        </p>

        {snap.enabled && (
          <div className="space-y-1 rounded-md border p-2 text-xs">
            <p>
              Bill numbers on this counter:{" "}
              <span className="font-mono font-semibold">OFL-{snap.counterCode}/…</span>
            </p>
            <div className="flex items-center justify-between gap-2">
              <span>
                {snap.catalog.status === "loading"
                  ? "Saving item list…"
                  : snap.catalog.count > 0
                    ? `${snap.catalog.count.toLocaleString("en-IN")} items saved${
                        snap.catalog.syncedAt ? `, updated ${format(snap.catalog.syncedAt, "dd MMM HH:mm")}` : ""
                      }`
                    : "Item list not saved yet"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={offlineNow || snap.catalog.status === "loading"}
                onClick={() => void refreshOfflineCatalog(orgId, { force: true })}
                title="Update item list now"
              >
                {snap.catalog.status === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {snap.catalog.error && snap.catalog.count === 0 && (
              <p className="text-destructive">Could not save the item list: {snap.catalog.error}</p>
            )}
            <p className="text-muted-foreground">
              Returns, credit, points, advance and bill edits still need the internet. Keep this POS tab open
              while offline.
            </p>
          </div>
        )}

        {waiting > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {waiting} bill{waiting === 1 ? "" : "s"} waiting to be sent
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={snap.syncing}
                onClick={() => window.dispatchEvent(new Event(OFFLINE_POS_SYNC_NOW_EVENT))}
              >
                {snap.syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                Send now
              </Button>
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {snap.bills.map((b) => (
                <li key={b.localId} className="flex justify-between gap-2 rounded bg-muted/50 px-2 py-1">
                  <span className="font-mono">{b.saleNumber}</span>
                  <span>{format(b.createdAt, "HH:mm")}</span>
                  <span className="font-semibold">{money(b.netAmount)}</span>
                </li>
              ))}
            </ul>
            {snap.bills.some((b) => b.lastError) && (
              <p className="text-xs text-amber-600">Some bills could not be sent yet. They will be tried again.</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
