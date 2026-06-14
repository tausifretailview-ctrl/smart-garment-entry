import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { readPosCartSnapshot } from "@/lib/posCartPersistence";

function hasAnyPosCartItems(): boolean {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith("pos_cart_")) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { items?: unknown[] };
      if (Array.isArray(parsed.items) && parsed.items.length > 0) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Prompt-mode PWA update banner — user must click Reload; never auto-reloads.
 */
export function UpdatePrompt() {
  const { currentOrganization } = useOrganization();
  const [dismissed, setDismissed] = useState(false);
  const prevNeedRefresh = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    if (needRefresh && !prevNeedRefresh.current) {
      setDismissed(false);
    }
    prevNeedRefresh.current = needRefresh;
  }, [needRefresh]);

  const posCartHasItems = useCallback(() => {
    const orgId = currentOrganization?.id;
    if (orgId && readPosCartSnapshot(orgId)) return true;
    return hasAnyPosCartItems();
  }, [currentOrganization?.id]);

  const handleReload = useCallback(async () => {
    if (posCartHasItems()) {
      const ok = window.confirm(
        "You have an unsaved bill — reload anyway? Your cart is saved in this browser session and should restore after reload.",
      );
      if (!ok) return;
    }
    try {
      await updateServiceWorker(true);
    } catch (error) {
      console.error("SW update failed:", error);
    }
  }, [posCartHasItems, updateServiceWorker]);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[100] flex w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
      <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">
        A new version is ready.
      </p>
      <Button size="sm" className="h-8 shrink-0" onClick={() => void handleReload()}>
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 shrink-0"
        onClick={() => setDismissed(true)}
      >
        Later
      </Button>
    </div>
  );
}
