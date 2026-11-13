import { useEffect } from "react";
import { isChunkLoadError, attemptStaleChunkRecovery } from "@/lib/chunkLoadRetry";
import { resolveStartupOrgSlug } from "@/lib/bundledOrg";
import { applyOrgPwaManifest } from "@/lib/orgPwaManifest";
import { initNavigationPerfDiagnostics } from "@/lib/navigationPerfDiagnostics";
import { initCloudUsageDiagnostics } from "@/lib/cloudUsageDiagnostics";

/**
 * What the app does once at start-up, moved out of App.tsx (Plan Phase 4, S3).
 */

/** Startup health check: clear corrupted auth tokens before React mounts. */
export function cleanupCorruptedAuthTokens(): void {
  try {
    const authKeys = Object.keys(localStorage).filter(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    for (const key of authKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        // Must have access_token and refresh_token to be valid
        if (!parsed?.access_token || !parsed?.refresh_token) {
          console.warn('[Auth Health] Removing malformed auth token (missing fields):', key);
          localStorage.removeItem(key);
        }
      } catch {
        console.warn('[Auth Health] Removing corrupted auth token (invalid JSON):', key);
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    // localStorage may be unavailable in rare cases
    console.error('[Auth Health] Startup check failed:', e);
  }
}

/** Start-up effects of the app shell: chunk-skew recovery, PWA manifest, opt-in diagnostics. */
export function useAppStartupEffects(): void {
  // Keep the one-shot skew-recovery flag across reloads. Clearing it 1s after boot
  // caused a full-app refresh loop when a hashed chunk 404'd after deploy.
  useEffect(() => {
    sessionStorage.removeItem("chunk_reload_count");
  }, []);

  // Remembered shop → PWA manifest start_url = /{orgSlug} (not Platform Admin /auth).
  useEffect(() => {
    const slug = resolveStartupOrgSlug();
    if (slug) applyOrgPwaManifest(slug);
  }, []);

  // Recover from deploy skew / stale PWA cache (HTML served for hashed .js → MIME errors).
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) {
        console.error("Unhandled promise rejection:", event.reason);
        return;
      }
      event.preventDefault();
      if (attemptStaleChunkRecovery(event.reason)) {
        return;
      }
      console.warn("Chunk load failed (skew recovery exhausted):", event.reason);
    };

    // Some browsers surface MIME text/html module failures as window "error" (not rejection).
    const handleError = (event: ErrorEvent) => {
      const msg = event.message || "";
      const fromError = event.error;
      if (!isChunkLoadError(fromError) && !isChunkLoadError(msg)) return;
      if (attemptStaleChunkRecovery(fromError || msg)) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    initNavigationPerfDiagnostics();
    // Fetch-wrapper is flag-only. Never auto-enable in DEV — wrapping every
    // fetch (and logging it) repeats the console-on-hot-path regression.
    // Enable: localStorage ezzy_cloud_usage=1 or ?cloudusage=1
    const diagEnabled =
      (typeof localStorage !== "undefined" &&
        localStorage.getItem("ezzy_cloud_usage") === "1") ||
      (typeof window !== "undefined" &&
        window.location.search.includes("cloudusage=1"));
    if (diagEnabled) {
      initCloudUsageDiagnostics();
    }
  }, []);
}
