const { contextBridge, ipcRenderer } = require('electron');

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

  /** Desktop menu accelerators → same routes as Alt+P / Alt+N / Alt+B in the web app. */
  onNavigate: (callback) => {
    const listener = (_event, path) => callback(path);
    ipcRenderer.on('erp-navigate', listener);
    return () => ipcRenderer.removeListener('erp-navigate', listener);
  },
});
