import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useHideMobileBottomNav } from "@/hooks/useMobileChrome";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pwa-install-banner-dismissed";

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/**
 * Prompt install on Android (beforeinstallprompt) and iOS (Add to Home Screen hint).
 */
export function PwaInstallBanner() {
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const hideBottomNav = useHideMobileBottomNav();
  const { orgNavigate } = useOrgNavigation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  const standalone = isStandaloneDisplay() || isInstalled;
  const ios = isIOSDevice();
  const showAndroid = isAndroidDevice() && isInstallable && !standalone && !dismissed;
  const showIOS = ios && !standalone && !dismissed && !showAndroid;

  if (!showAndroid && !showIOS) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-[45] px-3 pointer-events-none",
        hideBottomNav
          ? "bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
          : "bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.5rem)]",
      )}
    >
      <div className="pointer-events-auto max-w-lg mx-auto bg-primary text-primary-foreground rounded-2xl shadow-lg border border-primary-foreground/10 px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Install EzzyERP app</p>
          {showAndroid ? (
            <p className="text-xs opacity-90 mt-0.5">
              Add to your home screen for full-screen billing and faster access.
            </p>
          ) : (
            <p className="text-xs opacity-90 mt-0.5">
              Tap <Share className="inline h-3 w-3 mx-0.5 align-text-bottom" /> then{" "}
              <strong>Add to Home Screen</strong>.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {showAndroid && (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 min-h-[44px] touch-manipulation"
              onClick={() => void promptInstall()}
            >
              <Download className="h-4 w-4 mr-1" />
              Install
            </Button>
          )}
          {showIOS && (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 min-h-[44px] touch-manipulation text-xs"
              onClick={() => orgNavigate("/install")}
            >
              How to
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 self-end"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
