import { useEffect } from "react";
import { initElectronViewportSync, syncElectronViewportHeight } from "@/lib/electronViewportSync";

/**
 * Windows desktop WebView often reports a wrong innerWidth on first paint (content looks
 * zoomed out / clipped). Minimize→restore triggers resize and fixes layout — this hook
 * does the same sync on mount, focus, and visibility without user action.
 */
const ENTRY_BILL_BODY_CLASS = "entry-bill-screen";

export function useEntryViewportSync(): void {
  useEffect(() => {
    document.body.classList.add(ENTRY_BILL_BODY_CLASS);
    return () => {
      document.body.classList.remove(ENTRY_BILL_BODY_CLASS);
    };
  }, []);

  useEffect(() => {
    initElectronViewportSync();

    const sync = () => syncElectronViewportHeight();

    sync();
    const raf = requestAnimationFrame(sync);
    const t50 = window.setTimeout(sync, 50);
    const t250 = window.setTimeout(sync, 250);
    const t800 = window.setTimeout(sync, 800);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t50);
      window.clearTimeout(t250);
      window.clearTimeout(t800);
    };
  }, []);
}
