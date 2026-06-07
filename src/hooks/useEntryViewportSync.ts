import { useEffect } from "react";

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
    let syncing = false;

    const sync = () => {
      if (syncing) return;
      syncing = true;
      try {
        const root = document.documentElement;
        root.classList.add("entry-viewport-synced");
        root.style.setProperty("--entry-vw", `${window.innerWidth}px`);
        if (root.style.zoom && root.style.zoom !== "1") {
          root.style.zoom = "1";
        }
      } finally {
        syncing = false;
      }
    };

    sync();
    const raf = requestAnimationFrame(sync);
    const t50 = window.setTimeout(sync, 50);
    const t250 = window.setTimeout(sync, 250);
    const t800 = window.setTimeout(sync, 800);

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    window.addEventListener("resize", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t50);
      window.clearTimeout(t250);
      window.clearTimeout(t800);
      window.removeEventListener("resize", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, []);
}
