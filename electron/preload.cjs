const { contextBridge } = require('electron');

// Expose a minimal, safe API to the renderer (the web app).
// This is additive only — the web app works identically with or without it.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
