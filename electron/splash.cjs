const { BrowserWindow, app } = require('electron');
const path = require('path');

let splash = null;

function showSplash() {
  if (splash && !splash.isDestroyed()) return splash;
  splash = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1e40af',
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splash.setMenuBarVisibility(false);
  const v = encodeURIComponent(app.getVersion());
  splash.loadFile(path.join(__dirname, 'splash.html'), { search: `v=${v}` }).catch(() => {});
  splash.on('closed', () => { splash = null; });
  return splash;
}

function closeSplash() {
  try {
    if (splash && !splash.isDestroyed()) splash.close();
  } catch {}
  splash = null;
}

module.exports = { showSplash, closeSplash };