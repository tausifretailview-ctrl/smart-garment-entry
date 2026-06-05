/** True when running inside the EzzyERP Electron desktop shell. */
export function isElectronShell(): boolean {
  return !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI
    ?.isElectron;
}

/**
 * Desktop app: keep only the active tab mounted (prefetch others) to avoid
 * renderer OOM / white-screen crashes from many hidden React trees.
 */
export function shouldElectronMountOnlyActiveTab(): boolean {
  return isElectronShell();
}
