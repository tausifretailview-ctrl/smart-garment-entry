// Release: build signed APK -> upload to private bucket "app-downloads" ->
// add filename to ALLOWED_FILES in download-apk -> bump APP_VERSION (+ CURRENT_APK_VERSION in function).

export const APP_VERSION = "1.1.0";

/** Stable install link — edge function mints a fresh signed URL on each request. */
export const ANDROID_APK_URL =
  import.meta.env.VITE_ANDROID_APK_URL?.trim() ||
  "https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/download-apk";

export const WINDOWS_SETUP_URL = import.meta.env.VITE_WINDOWS_SETUP_URL?.trim() || "";

export const WINDOWS_PORTABLE_URL = import.meta.env.VITE_WINDOWS_PORTABLE_URL?.trim() || "";

export const ANDROID_APK_DOWNLOAD_NAME = `EzzyERP-${APP_VERSION}.apk`;

function isHostedUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.length > 0 && (trimmed.startsWith("https://") || trimmed.startsWith("http://"));
}

/** True when a download URL is configured (default edge function or VITE override). */
export function isAndroidApkConfigured(url: string = ANDROID_APK_URL): boolean {
  return isHostedUrl(url);
}

export function isWindowsInstallerConfigured(): boolean {
  return isHostedUrl(WINDOWS_SETUP_URL);
}

export function isWindowsPortableConfigured(): boolean {
  return isHostedUrl(WINDOWS_PORTABLE_URL);
}
