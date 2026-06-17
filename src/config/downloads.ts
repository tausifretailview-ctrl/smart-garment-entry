// Release: upload installers to private bucket "app-downloads" ->
// add filenames to ALLOWED_FILES in download-apk / download-windows -> bump APP_VERSION.

export const APP_VERSION = "1.1.0";

const DEFAULT_SUPABASE_FUNCTIONS_ORIGIN = "https://lkbbrqcsbhqjvsxiorvp.supabase.co";

function resolveFunctionsOrigin(): string {
  const apkUrl = import.meta.env.VITE_ANDROID_APK_URL?.trim();
  if (apkUrl) {
    const match = apkUrl.match(/^(https?:\/\/[^/]+)/i);
    if (match) return match[1];
  }
  return DEFAULT_SUPABASE_FUNCTIONS_ORIGIN;
}

const FUNCTIONS_ORIGIN = resolveFunctionsOrigin();

/** Stable install link — edge function mints a fresh signed URL on each request. */
export const ANDROID_APK_URL =
  import.meta.env.VITE_ANDROID_APK_URL?.trim() ||
  `${FUNCTIONS_ORIGIN}/functions/v1/download-apk`;

export const WINDOWS_SETUP_FILE = `EzzyERP-Setup-${APP_VERSION}.exe`;
export const WINDOWS_PORTABLE_FILE = `EzzyERP-Portable-${APP_VERSION}.exe`;

export const WINDOWS_SETUP_URL =
  import.meta.env.VITE_WINDOWS_SETUP_URL?.trim() ||
  `${FUNCTIONS_ORIGIN}/functions/v1/download-windows`;

export const WINDOWS_PORTABLE_URL =
  import.meta.env.VITE_WINDOWS_PORTABLE_URL?.trim() ||
  `${FUNCTIONS_ORIGIN}/functions/v1/download-windows?file=${encodeURIComponent(WINDOWS_PORTABLE_FILE)}`;

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
