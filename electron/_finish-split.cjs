/**
 * Finish Item-4 split: write updater.cjs, printing.cjs, window.cjs, main.cjs
 * from the current monolithic main.cjs. Pure relocation.
 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const src = fs.readFileSync(path.join(dir, 'main.cjs'), 'utf8');

function between(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start not found: ' + startMarker.slice(0, 60));
  const b = endMarker ? src.indexOf(endMarker, a + startMarker.length) : src.length;
  if (b < 0) throw new Error('end not found: ' + (endMarker || '').slice(0, 60));
  return src.slice(a, b);
}

// ── updater.cjs ───────────────────────────────────────────────────
const updaterBody = between(
  '// ═══ AUTO-UPDATE ═══',
  'function resolveIcon()',
);

fs.writeFileSync(
  path.join(dir, 'updater.cjs'),
  [
    "const { app, dialog, ipcMain } = require('electron');",
    "const { autoUpdater } = require('electron-updater');",
    '',
    'let getMainWindow = () => null;',
    '',
    'function bindGetMainWindow(fn) {',
    '  getMainWindow = fn;',
    '}',
    '',
    updaterBody
      .replace(/mainWindow/g, 'getMainWindow()')
      // fix getMainWindow()() if any double — shouldn't happen
      .replace(/getMainWindow\(\)\(\)/g, 'getMainWindow()'),
    '',
    'function registerUpdaterIpc() {',
    "  ipcMain.handle('check-for-updates', async (_event, interactive = true) => {",
    '    checkForUpdatesManually(!!interactive);',
    '    return { success: true };',
    '  });',
    '}',
    '',
    'module.exports = {',
    '  bindGetMainWindow,',
    '  initAutoUpdater,',
    '  checkForUpdatesManually,',
    '  registerUpdaterIpc,',
    '};',
    '',
  ].join('\n'),
);

// Fix updater: dialog.showMessageBox(getMainWindow(), ...) is fine.
// But `dialog.showMessageBoxSync(getMainWindow(),` — fine.
// app.isQuitting — fine.

console.log('wrote updater.cjs');

// Verify updater doesn't have broken replacements on comments
let updaterSrc = fs.readFileSync(path.join(dir, 'updater.cjs'), 'utf8');
// The auto-updater section used mainWindow as parent — getMainWindow() is correct.
// But function names like checkForUpdatesManually must remain.

// ── printing.cjs ──────────────────────────────────────────────────
const printerPrefs = between(
  '// ── Step 8: System printer pinning',
  '// Application menu — Tally / Vyapar style',
);
const printerIpc = between(
  '// ═══ PRINTER IPC ═══',
  "app.on('window-all-closed'",
);

// printing needs chooseDefaultPrinter (uses mainWindow) + IPC handlers (use targetWindow)
// targetWindow stays in window.cjs — printing receives getTargetWindow / getMainWindow

const printingChoose = printerPrefs
  .replace(/mainWindow/g, 'getMainWindow()')
  .replace(/getMainWindow\(\)\(\)/g, 'getMainWindow()');

// Strip targetWindow from printer IPC — use injected getTargetWindow
let printingHandlers = printerIpc
  .replace(
    /function targetWindow\(\) \{\n  return BrowserWindow\.getFocusedWindow\(\) \|\| mainWindow \|\| BrowserWindow\.getAllWindows\(\)\[0\] \|\| null;\n\}\n\n/,
    '',
  )
  .replace(/targetWindow\(\)/g, 'getTargetWindow()')
  .replace(/ipcMain\.handle\('set-zoom-factor'[\s\S]*?\n\}\);\n\n/, ''); // zoom stays in window

fs.writeFileSync(
  path.join(dir, 'printing.cjs'),
  [
    "const { BrowserWindow, dialog, ipcMain } = require('electron');",
    '',
    'let getMainWindow = () => null;',
    'let getTargetWindow = () => null;',
    '',
    'function bindWindowAccessors({ getMainWindow: gmw, getTargetWindow: gtw }) {',
    '  getMainWindow = gmw;',
    '  getTargetWindow = gtw;',
    '}',
    '',
    printingChoose,
    '',
    printingHandlers,
    '',
    'function registerPrintingIpc() {',
    '  // Handlers registered at module load above (same as original top-level ipcMain.handle).',
    '}',
    '',
    'module.exports = {',
    '  bindWindowAccessors,',
    '  chooseDefaultPrinter,',
    '  registerPrintingIpc,',
    '};',
    '',
  ].join('\n'),
);

console.log('wrote printing.cjs');

// ── window.cjs ────────────────────────────────────────────────────
// Extract from ZOOM through end of createWindow, plus resolveIcon through notifyRendererLayoutSync,
// plus window IPC + set-zoom-factor + targetWindow

const zoomBlock = between('// ═══ ZOOM (unified) ═══', '// Single instance lock');
const resolveThroughCreateWindow = between(
  'function resolveIcon()',
  '// System tray (app keeps running',
);
const windowIpc = between(
  "ipcMain.handle('reload-app'",
  "ipcMain.handle('check-for-updates'",
);
const zoomIpc = between(
  "ipcMain.handle('set-zoom-factor'",
  "ipcMain.handle('get-printers'",
);

let windowBody = [
  zoomBlock.trimEnd(),
  '',
  resolveThroughCreateWindow.trimEnd(),
  '',
].join('\n');

// Replace inline HEADER_CSS / HINT_BAR_JS with shell-ui imports
windowBody = windowBody.replace(
  /  \/\/ Electron-only stylesheet:[\s\S]*?  const HEADER_CSS = `[\s\S]*?  `;\n\n  \/\/ Tally-style keyboard hint strip[\s\S]*?  const HINT_BAR_JS = `[\s\S]*?  `;\n\n  mainWindow\.webContents\.on\('did-finish-load', \(\) => \{\n    mainWindow\.webContents\.insertCSS\(HEADER_CSS\)\.catch\(\(\) => \{\}\);\n    mainWindow\.webContents\.executeJavaScript\(HINT_BAR_JS\)\.catch\(\(\) => \{\}\);\n  \}\);/,
  `  // Electron-only stylesheet + hint bar (from shell-ui.cjs)
  const HINT_BAR_JS = buildHintBarJs(app.getVersion());

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(HEADER_CSS).catch(() => {});
    mainWindow.webContents.executeJavaScript(HINT_BAR_JS).catch(() => {});
  });`,
);

// Replace inline security handlers with attachShellNavigation
windowBody = windowBody.replace(
  /  \/\/ Open external links \(target=_blank \/ window\.open\) in the default browser\n  mainWindow\.webContents\.setWindowOpenHandler\(\(\{ url \}\) => \{\n    void openExternalSafely\(url\);\n    return \{ action: 'deny' \};\n  \}\);\n\n  \/\/ Navigation allow-list\.[\s\S]*?    \}\n  \}\);\n\n  \/\/ Native right-click context menu/,
  `  attachShellNavigation(mainWindow.webContents, { isDev });

  // Native right-click context menu`,
);

// Context menu still references openExternalSafely — keep import

// Close-to-tray uses `tray` — inject getTray
windowBody = windowBody.replace(
  '    if (!app.isQuitting && tray) {',
  '    if (!app.isQuitting && getTray()) {',
);

fs.writeFileSync(
  path.join(dir, 'window.cjs'),
  [
    "const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage } = require('electron');",
    "const path = require('path');",
    "const fs = require('fs');",
    "const windowStateKeeper = require('electron-window-state');",
    "const { closeSplash } = require('./splash.cjs');",
    "const { HEADER_CSS, buildHintBarJs } = require('./shell-ui.cjs');",
    "const {",
    '  PROD_URL,',
    '  DEV_URL,',
    '  openExternalSafely,',
    '  attachShellNavigation,',
    "} = require('./security.cjs');",
    '',
    'const isDev = !app.isPackaged;',
    '',
    'let mainWindow = null;',
    '// True until we detect a previously-saved window position. On first run we',
    '// maximize; afterwards we respect whatever size/position the user left behind.',
    'let isFirstRunWindow = true;',
    'let getTray = () => null;',
    '',
    'function bindGetTray(fn) {',
    '  getTray = fn;',
    '}',
    '',
    'function getMainWindow() {',
    '  return mainWindow;',
    '}',
    '',
    'function getAppUrl() {',
    '  return isDev ? DEV_URL : PROD_URL;',
    '}',
    '',
    windowBody,
    '',
    'function targetWindow() {',
    '  return BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0] || null;',
    '}',
    '',
    windowIpc.trimEnd() + ';', // incomplete — fix below
    '',
  ].join('\n'),
);

console.log('wrote window.cjs (partial — will patch)');

// The windowIpc ends before check-for-updates — good, but I appended badly.
// Rewrite window IPC registration cleanly.
{
  let w = fs.readFileSync(path.join(dir, 'window.cjs'), 'utf8');
  // Remove botched trailing windowIpc
  const cut = w.indexOf("ipcMain.handle('reload-app'");
  if (cut > 0) w = w.slice(0, cut);

  w += [
    '',
    "ipcMain.handle('reload-app', async () => {",
    "  manualReloadMainWindow('ipc');",
    '  return { success: true };',
    '});',
    '',
    "ipcMain.handle('window-minimize', async () => {",
    '  const win = targetWindow();',
    '  if (win) win.minimize();',
    '  return { success: true };',
    '});',
    '',
    "ipcMain.handle('window-toggle-maximize', async () => {",
    '  const win = targetWindow();',
    '  if (!win) return { success: false };',
    '  if (win.isMaximized()) win.unmaximize();',
    '  else win.maximize();',
    '  return { success: true, maximized: win.isMaximized() };',
    '});',
    '',
    "ipcMain.handle('window-close', async () => {",
    '  const win = targetWindow();',
    '  if (win) win.close();',
    '  return { success: true };',
    '});',
    '',
    zoomIpc.trimEnd(),
    '',
    'module.exports = {',
    '  getMainWindow,',
    '  bindGetTray,',
    '  createWindow,',
    '  resolveIcon,',
    '  applyZoomFactor,',
    '  stepZoom,',
    '  notifyRendererLayoutSync,',
    '  manualReloadMainWindow,',
    '  targetWindow,',
    '  isDev,',
    '};',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(dir, 'window.cjs'), w);
}

console.log('patched window.cjs');

// Sanity: window must still have createWindow function
{
  const w = fs.readFileSync(path.join(dir, 'window.cjs'), 'utf8');
  if (!w.includes('function createWindow()')) throw new Error('createWindow missing');
  if (!w.includes('attachShellNavigation')) throw new Error('attachShellNavigation missing');
  if (!w.includes('buildHintBarJs')) throw new Error('buildHintBarJs missing');
  if (w.includes('const HEADER_CSS = `')) throw new Error('HEADER_CSS still inline');
  if (w.includes('const HINT_BAR_JS = `')) throw new Error('HINT_BAR_JS still inline template');
  if (w.includes('setWindowOpenHandler')) throw new Error('setWindowOpenHandler still inline');
  console.log('window.cjs sanity OK');
}

// ── main.cjs (lifecycle + tray + menu) ────────────────────────────
const createTrayFn = between(
  '// System tray (app keeps running',
  'function sendNavigateShortcut',
);
const sendNavAndMenu = between(
  'function sendNavigateShortcut(path)',
  "ipcMain.handle('reload-app'",
);

const mainOut = `const { app, BrowserWindow, Menu, Tray, dialog, ipcMain } = require('electron');
const { showSplash } = require('./splash.cjs');
const {
  PROD_URL,
  SUPABASE_URL,
  SUPPORT_WHATSAPP_URL,
  openExternalSafely,
  registerOpenExternalIpc,
} = require('./security.cjs');
const {
  getMainWindow,
  bindGetTray,
  createWindow,
  resolveIcon,
  applyZoomFactor,
  stepZoom,
  notifyRendererLayoutSync,
  manualReloadMainWindow,
  targetWindow,
  isDev,
} = require('./window.cjs');
const {
  bindGetMainWindow: bindUpdaterMainWindow,
  initAutoUpdater,
  checkForUpdatesManually,
  registerUpdaterIpc,
} = require('./updater.cjs');
const {
  bindWindowAccessors: bindPrintingWindows,
  chooseDefaultPrinter,
} = require('./printing.cjs');

// ═══ PERF SWITCHES (must be set BEFORE app.whenReady) ═══
// Keep timers/queries running normally when the window is hidden or in tray,
// so reopening the app feels instant instead of "frozen for a few seconds".
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Larger HTTP disk cache so JS chunks / images survive across launches on a busy ERP.
app.commandLine.appendSwitch('disk-cache-size', '536870912'); // 512 MB

let tray;

bindGetTray(() => tray);
bindUpdaterMainWindow(getMainWindow);
bindPrintingWindows({ getMainWindow, getTargetWindow: targetWindow });
registerOpenExternalIpc();
registerUpdaterIpc();

// Single instance lock — prevent multiple copies running simultaneously
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      notifyRendererLayoutSync();
    }
  });

  app.whenReady().then(() => {
    // Warm TLS sockets to the website + backend so the first request is faster.
    try {
      const { session } = require('electron');
      session.defaultSession.preconnect({ url: PROD_URL, numSockets: 2 });
      session.defaultSession.preconnect({ url: SUPABASE_URL, numSockets: 2 });
    } catch {}
    // Branded splash — destroyed once the main window is ready-to-show.
    try { showSplash(); } catch {}
    createWindow();
    createTray();
    createMenu();
    initAutoUpdater();
  });
}

${createTrayFn
  .replace(/function createTray\(\)/, 'function createTray()')
  .replace(/mainWindow/g, 'getMainWindow()')
  .replace(/getMainWindow\(\)\(\)/g, 'getMainWindow()')
  .replace(/const icon = resolveIcon\(\);/, 'const icon = resolveIcon();')}

${sendNavAndMenu
  .replace(/mainWindow/g, 'getMainWindow()')
  .replace(/getMainWindow\(\)\(\)/g, 'getMainWindow()')}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents
      .executeJavaScript(
        \`(function () {
          try {
            for (var i = sessionStorage.length - 1; i >= 0; i--) {
              var k = sessionStorage.key(i);
              if (k && k.indexOf('pos_cart_') === 0) sessionStorage.removeItem(k);
            }
            for (var j = localStorage.length - 1; j >= 0; j--) {
              var lk = localStorage.key(j);
              if (lk && lk.indexOf('pos_cart_') === 0) localStorage.removeItem(lk);
            }
          } catch (e) {}
        })();\`,
      )
      .catch(() => {});
  }
});
`;

fs.writeFileSync(path.join(dir, 'main.cjs'), mainOut);
console.log('wrote main.cjs');

// Fix common double-call bugs in tray: getMainWindow().show() when we replaced
// mainWindow.show → getMainWindow().show — good
// But `if (getMainWindow()) { getMainWindow().show()` — fine

// Fix createTray: `tray = new Tray` — tray is let in main — good
// Fix: `if (getMainWindow()) { getMainWindow().show()` after replace of `if (mainWindow)` 

// Check printing for leftover set-zoom and targetWindow function
{
  const p = fs.readFileSync(path.join(dir, 'printing.cjs'), 'utf8');
  if (p.includes('set-zoom-factor')) throw new Error('printing still has set-zoom-factor');
  if (p.includes('function targetWindow')) throw new Error('printing still defines targetWindow');
  if (!p.includes('get-printers')) throw new Error('printing missing get-printers');
  if (!p.includes('print-html')) throw new Error('printing missing print-html');
  console.log('printing.cjs sanity OK');
}

// Syntax check all modules
for (const f of ['security.cjs', 'shell-ui.cjs', 'updater.cjs', 'printing.cjs', 'window.cjs', 'main.cjs']) {
  require('child_process').execSync('node --check "' + path.join(dir, f) + '"', { stdio: 'inherit' });
  console.log('syntax OK', f);
}

console.log('SPLIT COMPLETE');
