// Release (Option B — Vercel env, no code change per URL):
// 1. Build signed APK locally -> upload to Supabase Storage bucket "app-downloads" (public).
// 2. Set VITE_ANDROID_APK_URL in Vercel (and locally in .env for dev).
// 3. Bump APP_VERSION here when releasing a new native build (download filename only).

export const APP_VERSION = "1.1.0";

export const ANDROID_APK_URL = import.meta.env.VITE_ANDROID_APK_URL?.trim() ?? "";

export const WINDOWS_SETUP_URL = import.meta.env.VITE_WINDOWS_SETUP_URL?.trim() ?? "";

export const WINDOWS_PORTABLE_URL = import.meta.env.VITE_WINDOWS_PORTABLE_URL?.trim() ?? "";

export const ANDROID_APK_DOWNLOAD_NAME = `EzzyERP-${APP_VERSION}.apk`;

function isHostedUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.length > 0 && (trimmed.startsWith("https://") || trimmed.startsWith("http://"));
}

/** True when VITE_ANDROID_APK_URL is set to a hosted URL (Vercel / .env). */
export function isAndroidApkConfigured(url: string = ANDROID_APK_URL): boolean {
  return isHostedUrl(url);
}

export function isWindowsInstallerConfigured(): boolean {
  return isHostedUrl(WINDOWS_SETUP_URL);
}

export function isWindowsPortableConfigured(): boolean {
  return isHostedUrl(WINDOWS_PORTABLE_URL);
}
