import type { CapacitorConfig } from "@capacitor/cli";

const PRODUCTION_HOST = "https://app.inventoryshop.in";

/** Set when building a shop-specific APK, e.g. CAPACITOR_ORG_SLUG=ella-noor npm run build:android */
const bundledOrgSlug = (process.env.CAPACITOR_ORG_SLUG ?? process.env.VITE_BUNDLED_ORG_SLUG ?? "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "");

const serverUrl = bundledOrgSlug ? `${PRODUCTION_HOST}/${bundledOrgSlug}` : PRODUCTION_HOST;

const config: CapacitorConfig = {
  appId: "com.ezzyerp.app",
  appName: "EzzyERP",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
    url: serverUrl,
    cleartext: false,
    // Local asset shown if remote shell URL fails (no network / DNS).
    errorPath: "native-load-error.html",
  },
  plugins: {
    SplashScreen: {
      // Remote-shell APK loads https://app.inventoryshop.in — keep native splash until
      // JS calls SplashScreen.hide(). Auto-hide at 2s caused a white blank WebView on
      // slow/first install before the remote HTML arrived (EzzyERP 1.1.0 white screen).
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#1e40af",
      androidSplashResourceName: "splash",
      showSpinner: true,
      androidSpinnerStyle: "large",
      spinnerColor: "#ffffff",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#1e40af",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
