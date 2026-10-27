import { isPublicStorefrontPath, setStorefrontCustomDomainSlug } from "@/lib/storefrontPath";
import { isPossibleStoreHost, resolveStoreSlugForHost } from "@/lib/storefrontDomain";
import "./index.css";

/**
 * A boot chunk the server no longer has (erpBootstrap-<hash>.js replaced by a deploy)
 * rejects this dynamic import and fires no script/link error event, so the boot guard
 * in index.html cannot see it: the tab sat on a blank splash with
 * "Failed to fetch dynamically imported module" (2026-10-27). Route the rejection to
 * that guard — it drops the service worker + Cache Storage, re-downloads the dead file
 * past the 1-year immutable cache, and reloads once. When it declines (attempts spent,
 * offline, or a genuine app error) the shop still gets a Reload screen, not a blank page.
 */
type BootGuardWindow = Window & {
  __ezzyBootImportFailed?: (msg: string) => boolean;
  __ezzyBootRecover?: () => void;
};

function showBootFailureScreen(): void {
  try {
    const splash = document.getElementById("splash-screen");
    if (!splash || splash.dataset.hiding === "1") return;
    splash.dataset.bootFailed = "1";
    splash.style.display = "flex";
    splash.style.opacity = "1";
    splash.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px;text-align:center;font-family:system-ui,sans-serif;">' +
      '<div style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:8px;">EzzyERP</div>' +
      '<p style="color:#64748b;font-size:14px;max-width:320px;margin-bottom:20px;">The app could not load its files. This usually happens right after an update or a brief network issue.</p>' +
      '<button type="button" onclick="window.__ezzyBootRecover ? window.__ezzyBootRecover() : location.reload()" style="padding:10px 24px;font-size:14px;font-weight:600;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;">Reload</button>' +
      "</div>";
  } catch {
    // Nothing else can run from the entry chunk.
  }
}

function onBootImportFailed(error: unknown): void {
  const msg =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const w = window as BootGuardWindow;
  let recovered = false;
  try {
    recovered = w.__ezzyBootImportFailed?.(msg) === true;
  } catch {
    recovered = false;
  }
  if (recovered) return;
  showBootFailureScreen();
}

/**
 * Public storefront is a separate chunk so visitors to /:orgSlug/store
 * do not download the ERP shell (auth, sidebar, POS, accounts).
 * A shop's own custom domain (not an app host) also boots the storefront;
 * if the host is not a published store's domain, the ERP loads as before.
 */
if (isPublicStorefrontPath(window.location.pathname)) {
  void import("./storefront/bootstrap").catch(onBootImportFailed);
} else if (isPossibleStoreHost(window.location)) {
  void resolveStoreSlugForHost(window.location.hostname)
    .then((slug) => {
      if (slug) {
        setStorefrontCustomDomainSlug(slug);
        void import("./storefront/bootstrap").catch(onBootImportFailed);
      } else {
        void import("./erpBootstrap").catch(onBootImportFailed);
      }
    })
    .catch(onBootImportFailed);
} else {
  void import("./erpBootstrap").catch(onBootImportFailed);
}
