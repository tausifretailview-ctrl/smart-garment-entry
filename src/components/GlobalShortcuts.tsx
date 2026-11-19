import { useGlobalNavigationShortcuts, useElectronNavigationBridge } from "@/hooks/useGlobalNavigationShortcuts";
import { useEscapeBack } from "@/hooks/useEscapeBack";
import { DcVisibilityController } from "@/components/DcVisibilityController";
import { WindowSwitcher } from "@/components/window-switcher/WindowSwitcher";

/** Org-wide keyboard layer (Esc back, Tally-style module keys, Electron menu bridge, DC show/hide). */
export function GlobalShortcuts() {
  useEscapeBack();
  useGlobalNavigationShortcuts();
  useElectronNavigationBridge();
  return (
    <>
      <DcVisibilityController />
      <WindowSwitcher />
    </>
  );
}
