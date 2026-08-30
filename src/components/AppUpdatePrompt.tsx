import { Capacitor } from "@capacitor/core";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { ElectronWebUpdatePrompt } from "@/components/ElectronWebUpdatePrompt";
import { isElectronShell } from "@/lib/electronShell";

/** PWA service-worker updates in browser; remote shells must not register a SW. */
export function AppUpdatePrompt() {
  if (isElectronShell() || Capacitor.isNativePlatform()) {
    return <ElectronWebUpdatePrompt />;
  }
  return <UpdatePrompt />;
}
