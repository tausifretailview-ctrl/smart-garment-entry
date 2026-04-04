import { useState } from "react";
import { X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IPadInstallBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("pwa-banner-dismissed") === "1"
  );

  const isIPad =
    /iPad/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);
  const isStandalone = (window.navigator as any).standalone === true;

  if (!isIPad || isStandalone || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90] bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-lg">
      <div className="flex-1">
        <p className="font-semibold text-sm">Install EzzyERP on your iPad</p>
        <p className="text-xs opacity-80 mt-0.5">
          Tap{" "}
          <Share className="inline h-3 w-3 mx-0.5" />{" "}
          then <strong>"Add to Home Screen"</strong> for full-screen mode.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary/80 shrink-0"
        onClick={() => {
          localStorage.setItem("pwa-banner-dismissed", "1");
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
