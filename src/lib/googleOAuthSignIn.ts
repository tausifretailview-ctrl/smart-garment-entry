import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { isElectronShell } from "@/lib/electronShell";

function isCustomDomain(): boolean {
  const host = window.location.hostname;
  return (
    !host.includes("lovable.app") &&
    !host.includes("lovableproject.com") &&
    !host.includes("localhost")
  );
}

/**
 * Lovable's OAuth bridge supplies provider secrets. Direct Supabase OAuth on a
 * custom domain requires Google client secret in the Supabase dashboard — without
 * it the authorize URL returns raw JSON in the Electron webview.
 */
function shouldUseLovableOAuthBridge(): boolean {
  return isElectronShell() || !isCustomDomain();
}

type GoogleOAuthResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signInWithGoogleOAuth(opts: {
  orgSlug?: string;
  redirectBase?: string;
}): Promise<GoogleOAuthResult> {
  const redirectBase = opts.redirectBase ?? "https://app.inventoryshop.in";
  const redirectTo = opts.orgSlug
    ? `${redirectBase}/${opts.orgSlug}`
    : redirectBase;

  if (shouldUseLovableOAuthBridge()) {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectTo,
    });
    if (result.error) {
      return {
        ok: false,
        message: result.error.message || "Google sign-in failed",
      };
    }
    return { ok: true };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: isElectronShell(),
    },
  });

  if (error) {
    return { ok: false, message: error.message || "Google sign-in failed" };
  }

  if (data?.url) {
    if (isElectronShell()) {
      const api = (window as Window & { electronAPI?: { openExternal?: (url: string) => Promise<void> } })
        .electronAPI;
      if (api?.openExternal) {
        await api.openExternal(data.url);
        return {
          ok: false,
          message:
            "Complete Google sign-in in your browser, then sign in here with the same email and password.",
        };
      }
    }
    window.location.href = data.url;
  }

  return { ok: true };
}
