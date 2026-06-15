// Release: build signed APK locally -> upload to Supabase Storage bucket "app-downloads"
// (public) -> paste its public URL here or set VITE_ANDROID_APK_URL -> bump APP_VERSION.

export const APP_VERSION = "1.1.0";

const ANDROID_APK_PLACEHOLDER = "<PASTE_SUPABASE_STORAGE_APK_URL>";

export const ANDROID_APK_URL =
  import.meta.env.VITE_ANDROID_APK_URL?.trim() || ANDROID_APK_PLACEHOLDER;

export const WINDOWS_SETUP_URL = import.meta.env.VITE_WINDOWS_SETUP_URL?.trim() || "";

export const WINDOWS_PORTABLE_URL = import.meta.env.VITE_WINDOWS_PORTABLE_URL?.trim() || "";

export const ANDROID_APK_DOWNLOAD_NAME = `EzzyERP-${APP_VERSION}.apk`;

/** True when a real hosted APK URL is configured (env or literal in this file). */
export function isAndroidApkConfigured(url: string = ANDROID_APK_URL): boolean {
  const trimmed = url.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== ANDROID_APK_PLACEHOLDER &&
    !trimmed.includes("PASTE_") &&
    (trimmed.startsWith("https://") || trimmed.startsWith("http://"))
  );
}

export function isWindowsInstallerConfigured(): boolean {
  const trimmed = WINDOWS_SETUP_URL.trim();
  return trimmed.length > 0 && (trimmed.startsWith("https://") || trimmed.startsWith("http://"));
}

export function isWindowsPortableConfigured(): boolean {
  const trimmed = WINDOWS_PORTABLE_URL.trim();
  return trimmed.length > 0 && (trimmed.startsWith("https://") || trimmed.startsWith("http://"));
}
