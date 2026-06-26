import { UpdatePrompt } from "@/components/UpdatePrompt";
import { ElectronWebUpdatePrompt } from "@/components/ElectronWebUpdatePrompt";
import { isElectronShell } from "@/lib/electronShell";

/** PWA service-worker updates in browser; server bundle check in Electron desktop shell. */
export function AppUpdatePrompt() {
  return isElectronShell() ? <ElectronWebUpdatePrompt /> : <UpdatePrompt />;
}
