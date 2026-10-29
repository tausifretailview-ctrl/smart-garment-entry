import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { openTeamChat } from "@/hooks/useShopChat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  dismissOwnerAlertsPrompt,
  enableOwnerAlertsOnThisPhone,
  isOwnerPushSupported,
  listenForOwnerAlertTaps,
  ownerAlertErrorText,
  refreshOwnerAlertsToken,
  shouldOfferOwnerAlertsPrompt,
} from "@/lib/ownerPush";

/** Wait after login before asking, so the prompt doesn't cover the first screen while it loads. */
const PROMPT_DELAY_MS = 4_000;

/**
 * Android app only: keep this phone's owner-alert token fresh, open the right
 * screen (or shop chat) when an alert is tapped, and ask an admin once whether to turn alerts on.
 * Renders nothing on web / Electron.
 */
export function OwnerPushBridge() {
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const { orgNavigate } = useOrgNavigation();
  const navigateRef = useRef(orgNavigate);
  navigateRef.current = orgNavigate;
  const orgId = currentOrganization?.id;
  const userId = user?.id;
  const [promptOpen, setPromptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Screen of a tapped alert, opened once the shop has loaded (a cold start would
  // otherwise be sent back to the home screen by the startup redirect).
  const [tappedPath, setTappedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwnerPushSupported() || !orgId || !userId) return;
    void refreshOwnerAlertsToken(orgId, userId);
  }, [orgId, userId]);

  useEffect(() => {
    if (!orgId || !userId || organizationRole !== "admin" || !shouldOfferOwnerAlertsPrompt()) return;
    const timer = window.setTimeout(() => setPromptOpen(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [orgId, userId, organizationRole]);

  useEffect(() => {
    if (!isOwnerPushSupported()) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    // A chat message opens that chat in the panel (state is kept until the shop has loaded).
    void listenForOwnerAlertTaps(setTappedPath, openTeamChat).then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!tappedPath || !orgId) return;
    const timer = window.setTimeout(() => {
      navigateRef.current(tappedPath);
      setTappedPath(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [tappedPath, orgId]);

  const notNow = () => {
    dismissOwnerAlertsPrompt();
    setPromptOpen(false);
  };

  const turnOn = async () => {
    if (!orgId || !userId) return;
    setBusy(true);
    try {
      await enableOwnerAlertsOnThisPhone(orgId, userId);
      toast.success("This phone will get owner alerts", {
        description: "Choose which alerts in Settings → Reports → Owner alerts.",
      });
      setPromptOpen(false);
    } catch (e) {
      toast.error("Could not turn on alerts", {
        description: `${ownerAlertErrorText(e)} You can try again in Settings → Reports → Owner alerts.`,
      });
      notNow();
    } finally {
      setBusy(false);
    }
  };

  if (!promptOpen) return null;

  return (
    <Dialog open={promptOpen} onOpenChange={(open) => {
        if (!open) notNow();
      }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Get shop alerts on this phone?</DialogTitle>
          <DialogDescription>
            Business report, low stock, big bills and the day-end summary, even when the app is closed. Tap Turn on, then
            choose Allow.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={notNow}>
            Not now
          </Button>
          <Button disabled={busy} onClick={() => void turnOn()}>
            {busy ? "Turning on…" : "Turn on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
