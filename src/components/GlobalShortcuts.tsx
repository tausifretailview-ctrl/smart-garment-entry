import { useGlobalNavigationShortcuts, useElectronNavigationBridge } from "@/hooks/useGlobalNavigationShortcuts";
import { useEscapeBack } from "@/hooks/useEscapeBack";
import { DcVisibilityController } from "@/components/DcVisibilityController";

/** Org-wide keyboard layer (Esc back, Tally-style module keys, Electron menu bridge, DC show/hide). */
export function GlobalShortcuts() {
  useEscapeBack();
  useGlobalNavigationShortcuts();
  useElectronNavigationBridge();
  return <DcVisibilityController />;
}
