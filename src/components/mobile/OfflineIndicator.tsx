import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";

type ConnectionStatus = "online" | "offline" | "syncing" | "synced" | "error";

interface OfflineIndicatorProps {
  className?: string;
  showAlways?: boolean;
}

export const OfflineIndicator = ({ className, showAlways = false }: OfflineIndicatorProps) => {
  const [status, setStatus] = useState<ConnectionStatus>("online");
  const [showBanner, setShowBanner] = useState(false);
  const { pendingActions, isSyncing, syncActions, isOnline } = useOfflineSync();

  useEffect(() => {
    const updateStatus = () => {
      if (!isOnline) {
        setStatus("offline");
        setShowBanner(true);
      } else if (isSyncing) {
        setStatus("syncing");
        setShowBanner(true);
      } else if (pendingActions > 0) {
        setStatus("error");
        setShowBanner(true);
      } else {
        setStatus("online");
        // Show synced briefly then hide
        if (showBanner && !showAlways) {
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
  }, [isSyncing, pendingActions, showBanner, isOnline, showAlways]);

  // For inline display mode
  if (showAlways) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-amber-600">
              Offline{pendingActions > 0 && ` • ${pendingActions}`}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
            <span className="text-xs text-blue-600">Syncing...</span>
          </>
        ) : pendingActions > 0 ? (
          <>
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-amber-600">{pendingActions} pending</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 px-1.5 text-xs"
              onClick={() => syncActions()}
            >
              Retry
            </Button>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-600">Online</span>
          </>
        )}
      </div>
    );
  }

  if (!showBanner && status === "online") return null;

  const statusConfig = {
    online: {
      icon: Wifi,
      text: "Connected",
      className: "bg-green-500/90 text-white",
      showRetry: false,
    },
    offline: {
      icon: WifiOff,
      text: `Offline${pendingActions > 0 ? ` • ${pendingActions} pending` : ""}`,
      className: "bg-amber-500/90 text-white",
      showRetry: false,
    },
    syncing: {
      icon: RefreshCw,
      text: `Syncing ${pendingActions} action${pendingActions !== 1 ? "s" : ""}...`,
      className: "bg-blue-500/90 text-white",
      showRetry: false,
    },
    synced: {
      icon: Check,
      text: "All synced",
      className: "bg-green-500/90 text-white",
      showRetry: false,
    },
    error: {
      icon: AlertCircle,
      text: `Sync failed • ${pendingActions} pending`,
      className: "bg-red-500/90 text-white",
      showRetry: true,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium transition-all duration-300 lg:hidden",
      config.className,
      showBanner ? "translate-y-0" : "-translate-y-full",
      className
    )}>
      <Icon className={cn(
        "h-4 w-4",
        status === "syncing" && "animate-spin"
      )} />
      <span>{config.text}</span>
      {config.showRetry && (
        <Button 
          variant="secondary" 
          size="sm" 
          className="h-6 px-2 text-xs ml-2"
          onClick={() => syncActions()}
        >
          Retry
        </Button>
      )}
    </div>
  );
};
