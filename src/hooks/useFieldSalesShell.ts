import { useLayoutEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Field Sales app shell (salesman screens + its login page).
 *
 * - Text size: the web app's root is 18–19px (set for desktop screens). On a 360px phone that
 *   made every Field Sales screen oversized: titles wrapped, amounts were cut off and the size
 *   grid ran off the screen. While a Field Sales screen is open the root is 16px.
 * - Status bar: the Android app (Android 15+) draws the page under the status bar. Headers pad
 *   by FIELD_SALES_SAFE_TOP: the WebView's safe-area inset, or a fixed fallback when the WebView
 *   reports none.
 */
export const FIELD_SALES_ROOT_FONT_PX = 16;

/** Top padding for a Field Sales header so it clears the status bar. */
export const FIELD_SALES_SAFE_TOP = "max(env(safe-area-inset-top, 0px), var(--fs-safe-top-fallback, 0px))";
export const FIELD_SALES_SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

/** Status bar height to assume in the Android app when the WebView reports no inset. */
export function fieldSalesSafeTopFallbackPx(isNativeAndroid: boolean, userAgent: string): number {
  if (!isNativeAndroid) return 0;
  const version = Number(/Android (\d+)/.exec(userAgent)?.[1] ?? 0);
  // Edge-to-edge (page under the status bar) is enforced from Android 15.
  // Phones with a camera cut-out have status bars close to 40px.
  return version >= 15 ? 40 : 0;
}

/**
 * Phone shell for a screen: clears the status bar in the Android app and, when `phoneText` is
 * on, runs the screen at the phone text size. Used by the Field Sales app and the login pages.
 */
export function usePhoneShell(phoneText: boolean, rootClass?: string): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const prevFont = html.style.fontSize;
    if (phoneText) html.style.fontSize = `${FIELD_SALES_ROOT_FONT_PX}px`;
    if (rootClass) html.classList.add(rootClass);
    let nativeAndroid = false;
    try {
      nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
    } catch {
      /* not in the native shell */
    }
    html.style.setProperty("--fs-safe-top-fallback", `${fieldSalesSafeTopFallbackPx(nativeAndroid, navigator.userAgent)}px`);
    return () => {
      if (phoneText) html.style.fontSize = prevFont;
      if (rootClass) html.classList.remove(rootClass);
      html.style.removeProperty("--fs-safe-top-fallback");
    };
  }, [phoneText, rootClass]);
}

export function useFieldSalesShell(): void {
  usePhoneShell(true, "field-sales-app");
}
