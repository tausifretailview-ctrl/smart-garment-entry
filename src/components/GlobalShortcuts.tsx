import { useGlobalNavigationShortcuts, useElectronNavigationBridge } from "@/hooks/useGlobalNavigationShortcuts";
import { useEscapeBack } from "@/hooks/useEscapeBack";

/** Org-wide keyboard layer (Esc back, Tally-style module keys, Electron menu bridge). */
export function GlobalShortcuts() {
  useEscapeBack();
  useGlobalNavigationShortcuts();
  useElectronNavigationBridge();
  return null;
}
