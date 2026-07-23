import { useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { useLocation, useNavigate } from "react-router-dom";

const THEME_COLOR = "#1e40af";

/** Root paths where hardware back should exit the app instead of navigating. */
const EXIT_ON_BACK_PATHS = [
  "/auth",
  "/install",
];

function isExitOnBackPath(pathname: string): boolean {
  if (EXIT_ON_BACK_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Org home / mobile hub: /:orgSlug or /:orgSlug/mobile-more
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) return true;
  if (segments.length === 2 && segments[1] === "mobile-more") return true;
  return false;
}

let nativeShellInitialized = false;

/**
 * One-time native shell setup (splash, status bar, keyboard). Safe to call before React mounts.
 */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform() || nativeShellInitialized) return;
  nativeShellInitialized = true;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: THEME_COLOR });
    }
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Status bar plugin may be unavailable on some WebViews
  }

  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    // Keyboard plugin optional
  }

  try {
    // Hand off to HTML #splash-screen only after remote app JS has loaded.
    // With launchAutoHide:false the native splash stays up during network wait —
    // hiding here avoids a permanent blue splash once the web shell is alive.
    await SplashScreen.hide();
  } catch {
    // Splash may already be hidden
  }
}

export function useIsNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Registers Android hardware back inside React Router. Mount once inside BrowserRouter.
 */
export function useNativeBackButton(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBackRef = useRef(false);

  useEffect(() => {
    canGoBackRef.current = window.history.length > 1;
  }, [location]);

  const handleBack = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    if (isExitOnBackPath(location.pathname)) {
      await App.exitApp();
      return;
    }

    if (canGoBackRef.current) {
      navigate(-1);
    } else {
      await App.exitApp();
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;

    const setup = async () => {
      const listener = await App.addListener("backButton", () => {
        void handleBack();
      });
      remove = () => listener.remove();
    };

    void setup();
    return () => remove?.();
  }, [handleBack]);
}

/**
 * Full native app hook: re-runs shell init when mounted (e.g. after hot reload).
 */
export function useNativeApp(): { isNative: boolean } {
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
      void initNativeShell();
    }
  }, [isNative]);

  useNativeBackButton();

  return { isNative };
}
