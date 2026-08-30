const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const windowStateKeeper = require('electron-window-state');
const { closeSplash } = require('./splash.cjs');
const { HEADER_CSS, buildViewportSyncJs } = require('./shell-ui.cjs');
const {
  PROD_URL,
  DEV_URL,
  openExternalSafely,
  attachShellNavigation,
} = require('./security.cjs');
const { resolveElectronStartUrl, writeSavedOrgSlug } = require('./startupUrl.cjs');

const isDev = !app.isPackaged;

let mainWindow = null;
// True until we detect a previously-saved window position. On first run we
// maximize; afterwards we respect whatever size/position the user left behind.
let isFirstRunWindow = true;
let getTray = () => null;

function bindGetTray(fn) {
  getTray = fn;
}

function getMainWindow() {
  return mainWindow;
}

// ═══ ZOOM (unified) ═══
// Single source of truth for zoom so the Window menu (Ctrl+= / - / 0) and the
// Display Scale IPC ('set-zoom-factor') never drift. All paths use setZoomFactor.
const ZOOM_STEPS = [0.8, 0.85, 0.9, 1.0, 1.05, 1.1, 1.25];
let currentZoomFactor = 1.0;

function applyZoomFactor(factor) {
  const clamped = Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], factor));
  currentZoomFactor = clamped;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.setZoomFactor(clamped); } catch {}
  }
  return clamped;
}

function stepZoom(direction) {
  // Snap to the nearest step, then move one step in the requested direction.
  let idx = ZOOM_STEPS.indexOf(currentZoomFactor);
  if (idx === -1) {
    idx = 0;
    let best = Infinity;
    for (let i = 0; i < ZOOM_STEPS.length; i++) {
      const d = Math.abs(ZOOM_STEPS[i] - currentZoomFactor);
      if (d < best) { best = d; idx = i; }
    }
  }
  const nextIdx = Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + direction));
  applyZoomFactor(ZOOM_STEPS[nextIdx]);
}

function resolveIcon() {
  // Logo is supplied by the user at build/icon.png (square, ideally 512x512).
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, 'tray-icon.png'),
    path.join(__dirname, 'icon.ico'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) return { image: img, path: candidate };
    }
  }
  return null;
}

let loadRetryCount = 0;
const MAX_LOAD_RETRIES = 4;

function getAppUrl() {
  if (isDev) return DEV_URL;
  try {
    return resolveElectronStartUrl({
      prodUrl: PROD_URL,
      userDataPath: app.getPath('userData'),
      argv: process.argv,
    });
  } catch {
    return `${PROD_URL}/organization-setup`;
  }
}

function reloadMainWindow(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (loadRetryCount >= MAX_LOAD_RETRIES) {
    console.error('[EzzyERP] Load failed after retries:', reason);
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      buttons: ['Retry', 'Close'],
      defaultId: 0,
      cancelId: 1,
      title: 'EzzyERP could not load',
      message: 'The application failed to connect.',
      detail: 'Check your internet connection, then choose Retry. If the problem continues, close and reopen EzzyERP.',
    });
    if (choice === 0) {
      loadRetryCount = 0;
      mainWindow.loadURL(getAppUrl());
    }
    return;
  }
  loadRetryCount += 1;
  const delayMs = Math.min(8000, 1000 * loadRetryCount);
  console.warn(`[EzzyERP] Retrying load (${loadRetryCount}/${MAX_LOAD_RETRIES}) in ${delayMs}ms:`, reason);
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(getAppUrl());
  }, delayMs);
}

async function manualReloadMainWindow(source) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  loadRetryCount = 0;
  console.log('[EzzyERP] Manual refresh:', source || 'unknown');
  try {
    await mainWindow.webContents.session.clearCache();
  } catch (err) {
    console.warn('[EzzyERP] clearCache failed', err);
  }
  mainWindow.webContents.reloadIgnoringCache();
}

/** Stuck on Supabase OAuth JSON error (e.g. missing Google client secret). */
function recoverSupabaseOAuthJsonErrorPage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = mainWindow.webContents.getURL();
  if (!url.includes('supabase.co/auth/v1/')) return;

  mainWindow.webContents
    .executeJavaScript('document.body && document.body.innerText ? document.body.innerText.trim() : ""')
    .then((text) => {
      if (
        typeof text === 'string' &&
        text.startsWith('{') &&
        (text.includes('missing OAuth secret') || text.includes('validation_failed'))
      ) {
        console.warn('[EzzyERP] Recovering from Supabase OAuth JSON error page');
        mainWindow.loadURL(`${PROD_URL}?electron_oauth_error=1`);
      }
    })
    .catch(() => {});
}

/** Bill/POS footers need full viewport height — open maximized by default. */
function ensureMainWindowMaximized() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isMaximized()) {
    mainWindow.maximize();
  }
}

/** Push BrowserWindow client size into CSS vars — reliable on first maximize (innerHeight alone often wrong). */
function syncRendererViewportFromMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [cw, ch] = mainWindow.getContentSize();
  if (cw <= 0 || ch <= 0) return;
  mainWindow.webContents
    .executeJavaScript(
      `(function(w,h){
        try {
          var root = document.documentElement;
          root.classList.add('entry-viewport-synced');
          // Only mutate + dispatch resize when the dimensions actually change.
          // Unconditional resize events break Radix dropdowns and trigger query refetch storms.
          var prevW = parseInt(root.style.getPropertyValue('--ezzy-viewport-w'), 10);
          var prevH = parseInt(root.style.getPropertyValue('--ezzy-viewport-h'), 10);
          if (prevW === w && prevH === h) return;
          root.style.setProperty('--ezzy-viewport-h', h + 'px');
          root.style.setProperty('--ezzy-viewport-w', w + 'px');
          root.style.setProperty('--entry-vw', w + 'px');
          root.style.setProperty('--entry-vh', h + 'px');
          window.dispatchEvent(new Event('resize'));
        } catch (e) {}
      })(${cw},${ch});`,
    )
    .catch(() => {});
}

/** Mimics the manual maximize/restore resize that fixes clipped POS/bill footers in the WebView. */
function nudgeMaximizedLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // Real unmaximize → remaximize replicates exactly what clicking the Windows
  // restore/maximize buttons does — sends a genuine WM_SIZE message that forces
  // Chromium's compositor to recompute the full viewport height.
  // The old setContentSize nudge does NOT trigger the same compositor path.
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.maximize();
      setTimeout(syncRendererViewportFromMain, 80);
    }, 80);
  } else {
    // Fallback for non-maximized windows
    const [w, h] = mainWindow.getContentSize();
    if (w <= 0 || h <= 0) return;
    mainWindow.setContentSize(w, h - 1);
    mainWindow.setContentSize(w, h);
    syncRendererViewportFromMain();
  }
}

function notifyRendererLayoutSync() {
  syncRendererViewportFromMain();
}

function createWindow() {
  const icon = resolveIcon();

  // Remember the user's last window size/position across launches.
  const winState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });
  // No saved x means this is a fresh install / first launch → maximize on show.
  isFirstRunWindow = winState.x === undefined || winState.y === undefined;

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 1024,
    minHeight: 600, // 1366×768 @125% laptops have ~614px usable height; 700 forced a conflict
    title: 'EzzyERP — Smart Inventory & Billing',
    ...(icon ? { icon: icon.image } : {}),

    // Hide native Windows menu bar — in-app blue HeaderMenubar is the only visible chrome.
    autoHideMenuBar: false,

    // Premium framed titlebar — navy overlay with native window controls (Task 5).
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1e3a8a', symbolColor: '#ffffff', height: 36 },

    backgroundColor: '#1e40af', // match splash — no light-grey flash at handoff
    show: false, // Show after ready-to-show (branded splash in page)

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      zoomFactor: 1.0, // 100% — 0.8 left empty margins / “half screen”; density via ui-scale in app
      backgroundThrottling: false,
    },
  });

  // Persist future size/position/maximize changes automatically.
  winState.manage(mainWindow);

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(false);

  if (isDev) {
    mainWindow.loadURL(getAppUrl());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(getAppUrl());
  }

  mainWindow.webContents.on('did-finish-load', () => {
    loadRetryCount = 0;
    recoverSupabaseOAuthJsonErrorPage();
  });

  // Retry main-frame load failures (network blip / CDN timeout). User can still Ctrl+R anytime.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — navigation cancelled
    console.warn('[EzzyERP] did-fail-load:', errorCode);
    reloadMainWindow(`did-fail-load:${errorCode}`);
  });

  // Renderer crash/OOM — offer reload; a dead renderer shows a blank off-white window.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[EzzyERP] render-process-gone:', details);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Reload app', 'Close'],
      defaultId: 0,
      cancelId: 1,
      title: 'EzzyERP needs to restart',
      message: 'The application window stopped working.',
      detail: `Reason: ${details?.reason || 'unknown'}. Reload to continue. Unsaved work on the current screen may be lost.`,
    });
    if (choice === 0) {
      loadRetryCount = 0;
      mainWindow.loadURL(getAppUrl());
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[EzzyERP] window unresponsive');
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Wait', 'Reload now'],
      defaultId: 1,
      cancelId: 0,
      title: 'EzzyERP is not responding',
      message: 'The application stopped responding.',
      detail: 'Reload to recover. Unsaved work on the current screen may be lost.',
    });
    if (choice === 1) {
      manualReloadMainWindow('unresponsive-dialog');
    }
  });

  // Ctrl+R — reload the app even when focus is in a form.
  // Do NOT intercept F5/F11 here: POS (and POS Delivery Challan) bind F5 = Sale
  // Return and F11 = Size Stock. preventDefault() would swallow the key before the
  // renderer sees it, reloading mid-bill and discarding the cart. Refresh stays on
  // Ctrl+R and File/Window → Refresh App (no F1–F11 accelerators — see main.cjs).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrlR =
      input.control &&
      !input.shift &&
      !input.alt &&
      (input.key === 'r' || input.key === 'R');
    if (ctrlR) {
      event.preventDefault();
      manualReloadMainWindow('Ctrl+R');
    }
  });

  // Electron-only stylesheet + SPA viewport sync (hint bar is React DesktopHintBar).
  const VIEWPORT_SYNC_JS = buildViewportSyncJs();

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(HEADER_CSS).catch(() => {});
    mainWindow.webContents.executeJavaScript(VIEWPORT_SYNC_JS).catch(() => {});
  });

  mainWindow.webContents.on('did-finish-load', () => {
    notifyRendererLayoutSync();
    setTimeout(notifyRendererLayoutSync, 100);
    setTimeout(notifyRendererLayoutSync, 500);
  });

  // SPA route changes — re-sync viewport on every in-page navigation (POS tab click,
  // menu shortcut, Alt+P etc.) so footer is correct without any manual maximize toggle.
  mainWindow.webContents.on('did-navigate-in-page', () => {
    setTimeout(notifyRendererLayoutSync, 80);
    setTimeout(notifyRendererLayoutSync, 300);
  });

  // First run: open maximized so bill/POS footers fit. Afterwards: respect the
  // user's saved size/position (electron-window-state) — never force-maximize.
  mainWindow.once('ready-to-show', () => {
    try { closeSplash(); } catch {}
    // Native File/Edit menu must not appear above the in-app blue menubar (web-app chrome).
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(false);
    if (isFirstRunWindow) ensureMainWindowMaximized();
    mainWindow.show();
    mainWindow.focus();

    // Early passes: sync CSS vars only — window is not yet painted, nudge would be ignored
    [0, 60, 200].forEach((ms) => {
      setTimeout(() => {
        if (isFirstRunWindow) ensureMainWindowMaximized();
        notifyRendererLayoutSync();
      }, ms);
    });

    // 800ms: real unmaximize → remaximize once Chromium has committed its first frame.
    // Self-guards to only act when the window IS maximized, so a restored window is left alone.
    setTimeout(() => nudgeMaximizedLayout(), 800);

    // Late passes: re-sync CSS vars after the nudge has settled
    [1100, 1800, 2500].forEach((ms) => {
      setTimeout(() => {
        if (isFirstRunWindow) ensureMainWindowMaximized();
        notifyRendererLayoutSync();
      }, ms);
    });
  });

  mainWindow.on('show', () => {
    setTimeout(notifyRendererLayoutSync, 50);
  });

  mainWindow.on('maximize', () => {
    setTimeout(notifyRendererLayoutSync, 50);
  });

  mainWindow.on('resize', () => {
    setTimeout(notifyRendererLayoutSync, 16);
  });

  mainWindow.on('restore', () => {
    setTimeout(notifyRendererLayoutSync, 50);
  });

  attachShellNavigation(mainWindow.webContents, { isDev });

  // Native right-click context menu (Cut / Copy / Paste / Select All / Print).
  // Works on every input, table cell, link, image — no web-side change.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items = [];
    const editable = params.isEditable;
    const hasSelection = !!(params.selectionText && params.selectionText.trim());

    if (editable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' });
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' });
      items.push({ type: 'separator' }, { role: 'selectAll' });
    } else if (hasSelection) {
      items.push({ role: 'copy' });
    }

    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: 'Open Link in Browser',
        click: () => { void openExternalSafely(params.linkURL); },
      });
      items.push({
        label: 'Copy Link',
        click: () => require('electron').clipboard.writeText(params.linkURL),
      });
    }

    if (params.hasImageContents && params.srcURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: 'Copy Image Address',
        click: () => require('electron').clipboard.writeText(params.srcURL),
      });
      items.push({
        label: 'Save Image As…',
        click: () => mainWindow.webContents.downloadURL(params.srcURL),
      });
    }

    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Refresh App',
      accelerator: 'CmdOrCtrl+R',
      click: () => manualReloadMainWindow('context-menu'),
    });
    items.push({
      label: 'Print…',
      accelerator: 'CmdOrCtrl+P',
      click: () => mainWindow.webContents.print({ silent: false, printBackground: true }, () => {}),
    });

    if (!app.isPackaged) {
      items.push({ type: 'separator' });
      items.push({
        label: 'Inspect Element',
        click: () => mainWindow.webContents.inspectElement(params.x, params.y),
      });
    }

    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // Close to tray instead of quitting (like Tally minimizing to tray)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && getTray()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}


function targetWindow() {
  return BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0] || null;
}


ipcMain.handle('remember-org-slug', async (_event, slug) => {
  try {
    const ok = writeSavedOrgSlug(app.getPath('userData'), slug);
    return { success: !!ok };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('reload-app', async () => {
  manualReloadMainWindow('ipc');
  return { success: true };
});

ipcMain.handle('window-minimize', async () => {
  const win = targetWindow();
  if (win) win.minimize();
  return { success: true };
});

ipcMain.handle('window-toggle-maximize', async () => {
  const win = targetWindow();
  if (!win) return { success: false };
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return { success: true, maximized: win.isMaximized() };
});

ipcMain.handle('window-close', async () => {
  const win = targetWindow();
  if (win) win.close();
  return { success: true };
});

ipcMain.handle('set-zoom-factor', async (_event, factor) => {
  const win = targetWindow();
  if (!win || win.isDestroyed()) return { success: false };
  const n = Number(factor);
  if (!Number.isFinite(n) || n < 0.5 || n > 2) return { success: false };
  try {
    win.webContents.setZoomFactor(n);
    // Keep the unified zoom state in sync so the Window menu and Display Scale agree.
    currentZoomFactor = n;
    return { success: true };
  } catch {
    return { success: false };
  }
});

module.exports = {
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
};
