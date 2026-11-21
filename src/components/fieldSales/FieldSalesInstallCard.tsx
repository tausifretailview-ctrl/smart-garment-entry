import { useState } from "react";
import { Download, MoreVertical, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * "Install Field Sales app" on the Field Sales login page (the link the owner sends a salesman
 * from Employee Master). Android Chrome: one-tap Install when Chrome offers it, else the
 * Chrome-menu steps. iPhone: Safari Share → Add to Home Screen. Hidden inside the installed app.
 * The page must use useFieldSalesManifest so the install is Field Sales, not the owner app.
 */
export function FieldSalesInstallCard() {
  const { isInstallable, isInstalled, canOfferInstall, isIOS, promptInstall } = useInstallPrompt();
  const [showSteps, setShowSteps] = useState(false);

  if (!canOfferInstall || isInstalled) return null;

  const install = async () => {
    const ok = await promptInstall();
    if (ok) toast.success("Field Sales app installed — open it from your home screen.");
    else setShowSteps(true);
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-white/90 p-4 shadow-sm" data-testid="field-sales-install-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">Install the Field Sales app</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Get the orange Field Sales icon on this phone — opens straight to your customers and orders.
          </p>
        </div>
      </div>

      {isIOS ? (
        <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900" data-testid="field-sales-install-ios">
          In Safari tap <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" /> <b>Share</b>, then{" "}
          <b>Add to Home Screen</b>.
        </p>
      ) : (
        <>
          <Button
            type="button"
            onClick={() => void install()}
            className="mt-3 h-11 w-full bg-orange-500 text-base font-semibold text-white hover:bg-orange-600"
            data-testid="field-sales-install-button"
          >
            <Download className="mr-2 h-4 w-4" />
            {isInstallable ? "Install Field Sales app" : "Install app"}
          </Button>
          {showSteps || !isInstallable ? (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="field-sales-install-steps">
              If no install window opens: tap Chrome&apos;s <MoreVertical className="inline h-3.5 w-3.5 align-text-bottom" /> menu
              → <b>Install app</b> (or <b>Add to Home screen</b>). Turn off &quot;Desktop site&quot; first.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
