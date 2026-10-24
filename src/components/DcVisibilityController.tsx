import { useEffect } from "react";
import { EyeOff, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDcVisibility } from "@/hooks/useDcVisibility";
import {
  dcVisibilityStorageKey,
  expireDcVisibility,
  touchDcVisibility,
} from "@/lib/dcVisibility";

const TOUCH_EVERY_MS = 30_000;

/**
 * Ctrl+Shift+H flips DC show / hide for this tab (works inside inputs).
 * While flipped, a small chip shows the state; click it to go back to the shop's mode.
 */
export function DcVisibilityController() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { mode, flipped, canFlip, dcReady, toggle, reset } = useDcVisibility();
  const key =
    user?.id && currentOrganization?.id
      ? dcVisibilityStorageKey(user.id, currentOrganization.id)
      : null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
      if (e.code !== "KeyH" && (e.key ?? "").toLowerCase() !== "h") return;
      if (!canFlip) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canFlip, toggle]);

  useEffect(() => {
    if (!key || !flipped) return;
    let lastTouch = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch < TOUCH_EVERY_MS) return;
      lastTouch = now;
      touchDcVisibility(key, now);
    };
    window.addEventListener("keydown", onActivity, true);
    window.addEventListener("pointerdown", onActivity, true);
    const timer = window.setInterval(() => expireDcVisibility(key), 60_000);
    return () => {
      window.removeEventListener("keydown", onActivity, true);
      window.removeEventListener("pointerdown", onActivity, true);
      window.clearInterval(timer);
    };
  }, [key, flipped]);

  if (!flipped) return null;

  const hiddenNow = mode === "show";
  return (
    <button
      type="button"
      onClick={reset}
      className="fixed bottom-3 left-3 z-[150] flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800 shadow-md dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200 print:hidden"
      title={
        hiddenNow && !dcReady
          ? "DC hiding needs the DC database update (Settings > Purchase). Click to go back."
          : "Click or press Ctrl+Shift+H to go back"
      }
    >
      {hiddenNow ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {hiddenNow ? (dcReady ? "DC hidden" : "DC hide: update pending") : "DC visible"}
    </button>
  );
}
