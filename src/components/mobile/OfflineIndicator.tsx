import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";

type ConnectionStatus = "online" | "offline" | "syncing" | "synced";

export const OfflineIndicator = () => {
  const [status, setStatus] = useState<ConnectionStatus>("online");
  const [showBanner, setShowBanner] = useState(false);
  const { pendingActions, isSyncing, lastSyncTime } = useOfflineSync();

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) {
        setStatus("offline");
        setShowBanner(true);
      } else if (isSyncing) {
        setStatus("syncing");
        setShowBanner(true);
      } else if (pendingActions > 0) {
        setStatus("syncing");
        setShowBanner(true);
      } else {
        setStatus("online");
        // Show synced briefly then hide
        if (showBanner) {
          setStatus("synced");
          setTimeout(() => setShowBanner(false), 2000);
        }
      }
    };

    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, [isSyncing, pendingActions, showBanner]);

  if (!showBanner && status === "online") return null;

  const statusConfig = {
    online: {
      icon: Wifi,
      text: "Connected",
      className: "bg-green-500/90 text-white",
    },
    offline: {
      icon: WifiOff,
      text: `Offline${pendingActions > 0 ? ` • ${pendingActions} pending` : ""}`,
      className: "bg-amber-500/90 text-white",
    },
    syncing: {
      icon: RefreshCw,
      text: `Syncing ${pendingActions} action${pendingActions !== 1 ? "s" : ""}...`,
      className: "bg-blue-500/90 text-white",
    },
    synced: {
      icon: Check,
      text: "All synced",
      className: "bg-green-500/90 text-white",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 px-4 text-sm font-medium transition-all duration-300 lg:hidden",
      config.className,
      showBanner ? "translate-y-0" : "-translate-y-full"
    )}>
      <Icon className={cn(
        "h-4 w-4",
        status === "syncing" && "animate-spin"
      )} />
      <span>{config.text}</span>
    </div>
  );
};
