import { isElectronShell } from "@/lib/electronShell";

/** CSS variable — actual BrowserWindow client height (not full-monitor 100dvh). */
export const EZZY_VIEWPORT_H_VAR = "--ezzy-viewport-h";
export const EZZY_VIEWPORT_W_VAR = "--ezzy-viewport-w";

let initialized = false;

/**
 * Set shell height from window.innerHeight so bill/POS footers fit on first paint
 * in the Electron app (100dvh alone often exceeds a restored window and clips the footer).
 */
export function syncElectronViewportHeight(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? window.innerWidth);
  const h = Math.round(vv?.height ?? window.innerHeight);
  if (h <= 0 || w <= 0) return;

  root.classList.add("entry-viewport-synced");
  root.style.setProperty(EZZY_VIEWPORT_H_VAR, `${h}px`);
  root.style.setProperty(EZZY_VIEWPORT_W_VAR, `${w}px`);
  root.style.setProperty("--entry-vw", `${w}px`);
  root.style.setProperty("--entry-vh", `${h}px`);

  if (root.style.zoom && root.style.zoom !== "1") {
    root.style.zoom = "1";
  }
}

/** One-time global listeners — safe to call before React mounts. */
export function initElectronViewportSync(): void {
  if (!isElectronShell() || initialized) return;
  initialized = true;

  const sync = () => syncElectronViewportHeight();

  sync();
  requestAnimationFrame(sync);

  const delays = [0, 50, 150, 400, 800, 1500];
  const timers = delays.map((ms) => window.setTimeout(sync, ms));

  const onVisible = () => {
    if (document.visibilityState === "visible") sync();
  };

  window.addEventListener("resize", sync);
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", onVisible);

  const vv = window.visualViewport;
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(sync);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  }
}
