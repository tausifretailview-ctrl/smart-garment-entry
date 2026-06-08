import { isElectronShell } from "@/lib/electronShell";

const DESKTOP_OAUTH_ERROR_MSG =
  "Google sign-in is not available in the desktop app. Please use email and password.";

const OAUTH_ERROR_MARKERS = [
  "missing OAuth secret",
  "validation_failed",
  "Unsupported provider",
] as const;

function bodyLooksLikeSupabaseOAuthError(): boolean {
  const text = document.body?.innerText?.trim() ?? "";
  if (!text.startsWith("{") || !text.includes("error_code")) return false;
  return OAUTH_ERROR_MARKERS.some((marker) => text.includes(marker));
}

function resolveLoginPath(): string {
  try {
    const stored = localStorage.getItem("last_org_slug");
    if (stored && /^[a-z0-9-]+$/i.test(stored)) {
      return `/${stored}`;
    }
  } catch {
    /* ignore */
  }
  return "/";
}

/** Recover when Electron webview is stuck on a raw Supabase OAuth JSON error page. */
export function recoverElectronOAuthErrorPage(): void {
  if (!isElectronShell()) return;
  if (!bodyLooksLikeSupabaseOAuthError()) return;

  const loginPath = resolveLoginPath();
  try {
    sessionStorage.setItem("electron_oauth_error", DESKTOP_OAUTH_ERROR_MSG);
  } catch {
    /* ignore */
  }

  window.location.replace(`${window.location.origin}${loginPath}`);
}

export function consumeElectronOAuthErrorMessage(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("electron_oauth_error") === "1") {
      sessionStorage.setItem("electron_oauth_error", DESKTOP_OAUTH_ERROR_MSG);
      params.delete("electron_oauth_error");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }

    const msg = sessionStorage.getItem("electron_oauth_error");
    if (msg) {
      sessionStorage.removeItem("electron_oauth_error");
      return msg;
    }
  } catch {
    /* ignore */
  }
  return null;
}
