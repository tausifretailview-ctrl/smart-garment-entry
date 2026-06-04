/** HTML splash in index.html (sibling of #root) — hide when login / app shell is ready */

const SPLASH_ID = "splash-screen";

export function hideAppBootSplash(): void {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(SPLASH_ID);
  if (!splash || splash.dataset.hiding === "1") return;
  splash.dataset.hiding = "1";
  splash.style.transition = "opacity 0.25s ease-out";
  splash.style.opacity = "0";
  window.setTimeout(() => {
    splash.remove();
  }, 280);
}

/** Routes where a bare spinner should not replace the branded splash */
export function isAppBootRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/auth" || path === "/organization-setup" || path === "/reset-password") {
    return true;
  }
  // Org login: /{slug} only (single segment)
  const segments = path.split("/").filter(Boolean);
  return segments.length === 1;
}
