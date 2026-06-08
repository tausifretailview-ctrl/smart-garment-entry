type ElectronWindowApi = {
  isElectron?: boolean;
  reloadApp?: () => Promise<{ success?: boolean }>;
  openExternal?: (url: string) => Promise<void>;
};

/** True when running inside the EzzyERP Electron desktop shell. */
export function isElectronShell(): boolean {
  return !!getElectronAPI()?.isElectron;
}

function getElectronAPI(): ElectronWindowApi | undefined {
  return (window as Window & { electronAPI?: ElectronWindowApi }).electronAPI;
}

/** Manual full reload — desktop shell uses native reload; browser falls back to location.reload(). */
export function reloadElectronApp(): void {
  const api = getElectronAPI();
  if (api?.reloadApp) {
    void api.reloadApp();
    return;
  }
  window.location.reload();
}

/**
 * Desktop app: keep only the active tab mounted (prefetch others) to avoid
 * renderer OOM / white-screen crashes from many hidden React trees.
 *
 * Default changed to FALSE so the Electron shell now keeps every visited tab
 * mounted — switching Sale ↔ Purchase dashboards is instant (no remount, no
 * refetch, no skeleton flash), matching offline Tally/Vyapar feel.
 *
 * Low-RAM machines can opt back into single-tab mode by setting
 *   localStorage.ezzy_electron_single_tab = "1"
 * TabCachedPages still evicts idle tabs after 10 min with a safety floor.
 */
export function shouldElectronMountOnlyActiveTab(): boolean {
  if (!isElectronShell()) return false;
  try {
    return localStorage.getItem("ezzy_electron_single_tab") === "1";
  } catch {
    return false;
  }
}
