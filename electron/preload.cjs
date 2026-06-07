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

// Expose a minimal, safe API to the renderer (the web app).
// This is additive only — the web app works identically with or without it.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Printer APIs — silent/direct printing for the desktop app.
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  silentPrint: (options) => ipcRenderer.invoke('silent-print', options),
  printToPdf: (options) => ipcRenderer.invoke('print-to-pdf', options),
  printHtml: (options) => ipcRenderer.invoke('print-html', options),

  /** Full page reload — same as F5 / File → Refresh App. */
  reloadApp: () => ipcRenderer.invoke('reload-app'),

  /** Desktop menu accelerators → same routes as Alt+P / Alt+N / Alt+B in the web app. */
  onNavigate: (callback) => {
    const listener = (_event, path) => callback(path);
    ipcRenderer.on('erp-navigate', listener);
    return () => ipcRenderer.removeListener('erp-navigate', listener);
  },
});
