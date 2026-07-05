const { contextBridge, ipcRenderer } = require('electron');

// Mark the document so Electron-only CSS can scope itself with `html.desktop-shell`.
// Browser users never get this class, so the website is untouched.
function tagDesktopShell() {
  try {
    const root = document && document.documentElement;
    if (root && !root.classList.contains('desktop-shell')) {
      root.classList.add('desktop-shell');
    }
  } catch {}
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tagDesktopShell, { once: true });
  } else {
    tagDesktopShell();
  }
}

// Desktop shell is always online — unregister PWA service workers so stale JS
// bundles are not served from cache after a server deploy.
function unregisterServiceWorkersInDesktopShell() {
  try {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        void reg.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {});
    }
  } catch {}
}
if (typeof window !== 'undefined') {
  unregisterServiceWorkersInDesktopShell();
}

// Expose a minimal, safe API to the renderer (the web app).
// This is additive only — the web app works identically with or without it.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Printer APIs — silent/direct printing for the desktop app.
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  /** Match Display Scale (Compact / Standard / Large) — 0.85 / 1.0 / 1.05 */
  setZoomFactor: (factor) => ipcRenderer.invoke('set-zoom-factor', factor),
  silentPrint: (options) => ipcRenderer.invoke('silent-print', options),
  printToPdf: (options) => ipcRenderer.invoke('print-to-pdf', options),
  printHtml: (options) => ipcRenderer.invoke('print-html', options),

  /** Full page reload — same as F5 / File → Refresh App. */
  reloadApp: () => ipcRenderer.invoke('reload-app'),

  /** Check for a new desktop installer (Help → Check for Updates). */
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  /** Open a URL in the system browser (OAuth must not run inside the Electron webview). */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /** Desktop menu accelerators → same routes as Alt+P / Alt+N / Alt+B in the web app. */
  onNavigate: (callback) => {
    const listener = (_event, path) => callback(path);
    ipcRenderer.on('erp-navigate', listener);
    return () => ipcRenderer.removeListener('erp-navigate', listener);
  },

  /** Custom title-bar window controls (minimize / maximize / close). */
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
});
