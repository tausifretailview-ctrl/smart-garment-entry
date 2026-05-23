import { useNativeApp } from "@/hooks/useNativeApp";

/** Mount inside BrowserRouter to wire Capacitor back button and native shell. */
export function NativeAppBridge() {
  useNativeApp();
  return null;
}
