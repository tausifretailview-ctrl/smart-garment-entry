const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const windowStateKeeper = require('electron-window-state');
const { showSplash, closeSplash } = require('./splash.cjs');

// Dev = running from source (electron .), Prod = packaged .exe.
// Using app.isPackaged avoids an extra runtime dependency.
const isDev = !app.isPackaged;

const PROD_URL = 'https://app.inventoryshop.in';
const DEV_URL = 'http://localhost:8080';
const SUPABASE_URL = 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';

// Hosts allowed to load INSIDE the shell. Anything else opens in the system
// browser. 'localhost' is only trusted in dev (Vite dev server).
const ALLOWED_NAV_HOSTS = [
  'app.inventoryshop.in',
  'lkbbrqcsbhqjvsxiorvp.supabase.co',
  'localhost',
];

// TODO(tausif): set real support number before release.
const SUPPORT_WHATSAPP_URL = 'https://wa.me/REPLACE_WITH_REAL_NUMBER';

// ═══ PERF SWITCHES (must be set BEFORE app.whenReady) ═══
// Keep timers/queries running normally when the window is hidden or in tray,
// so reopening the app feels instant instead of "frozen for a few seconds".
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Larger HTTP disk cache so JS chunks / images survive across launches on a busy ERP.
app.commandLine.appendSwitch('disk-cache-size', '536870912'); // 512 MB

let mainWindow;
let tray;
// True until we detect a previously-saved window position. On first run we
// maximize; afterwards we respect whatever size/position the user left behind.
let isFirstRunWindow = true;

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

// Single instance lock — prevent multiple copies running simultaneously
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
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

// ═══ AUTO-UPDATE ═══
// Checks GitHub Releases on launch (only in the installed/packaged app),
// downloads in the background, and installs on restart.

let updaterWired = false;

function initAutoUpdater() {
  // Updates only work in the packaged, installed app (needs app-update.yml).
  // Skipped in dev and harmless for the portable build (errors are swallowed).
  if (!app.isPackaged) return;

  if (!updaterWired) {
    updaterWired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      const ver = info && info.version ? info.version : 'new';
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update available',
        message: `EzzyERP ${ver} is downloading in the background.`,
        detail: 'You will be prompted to restart when the update is ready. You can keep working meanwhile.',
        buttons: ['OK'],
      }).catch(() => {});
    });

    autoUpdater.on('update-downloaded', (info) => {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `EzzyERP ${info && info.version ? info.version : ''} has been downloaded.`,
        detail: 'Restart the app to apply the update.',
      });
      if (choice === 0) {
        app.isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[auto-updater]', err == null ? 'unknown error' : err);
    });
  }

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[auto-updater] check failed', err);
  });
}

// Manual "Check for Updates" trigger (Help menu). Silent when GitHub releases are unavailable.
function isUpdaterUnavailableError(err) {
  const msg = String(err && err.message ? err.message : err);
  return (
    msg.includes('404') ||
    msg.includes('releases.atom') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('net::ERR')
  );
}

function checkForUpdatesManually(interactive = true) {
  if (!app.isPackaged) {
    if (!interactive) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates are only available in the installed desktop app.',
      buttons: ['OK'],
    });
    return;
  }
  initAutoUpdater();
  autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (!interactive) return;
      const latest = result && result.updateInfo ? result.updateInfo.version : null;
      const current = app.getVersion();
      if (latest && latest === current) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Check for Updates',
          message: `You're on the latest desktop version (${current}).`,
          detail: 'Press F5 or use Refresh App to load the newest web features from the server.',
          buttons: ['OK'],
        });
      }
    })
    .catch((err) => {
      console.warn('[auto-updater] manual check failed', err);
      if (!interactive || isUpdaterUnavailableError(err)) return;
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update check failed',
        message: 'Could not check for updates.',
        detail: 'Press F5 to refresh the app from the server, or try again later.',
        buttons: ['OK'],
      });
    });
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
  return isDev ? DEV_URL : PROD_URL;
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

  // Retry main-frame load failures (network blip / CDN timeout). User can still F5 anytime.
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

  // F5 / Ctrl+R — always reload the app (Windows-style refresh), even when focus is in a form.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const f5 = input.key === 'F5';
    const ctrlR =
      input.control &&
      !input.shift &&
      !input.alt &&
      (input.key === 'r' || input.key === 'R');
    if (f5 || ctrlR) {
      event.preventDefault();
      manualReloadMainWindow(f5 ? 'F5' : 'Ctrl+R');
    }
  });

  // Electron-only stylesheet:
  //   1) Desktop fit fixes (POS toolbar height, sticky entry-form footer)
  //   2) Tally / Vyapar "desktop software" polish — scoped to html.desktop-shell
  //      so the browser / PWA experience is completely untouched.
  const HEADER_CSS = `
    /* ── Premium titlebar overlay (Task 5) ──────────────────────────
       BrowserWindow uses titleBarStyle:'hidden' + a 36px navy overlay that
       draws native minimize/maximize/close on the top-right. The overlay sits
       ABOVE page content, so we must NOT push the body down (no top gap). The
       web app's own blue header renders normally underneath the transparent
       overlay strip.
       NOTE (follow-up, do NOT change src/ here): the web app's header should
       later reserve the top-right ~140px for the window controls using the
       CSS env(titlebar-area-x/y/width/height) variables so buttons never sit
       under the native controls. That is a separate web-app task. */
    html.desktop-shell body { padding-top: 0; }

    /* ── Tally / Vyapar polish (Electron only) ─────────────────────── */
    html.desktop-shell, html.desktop-shell body {
      font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
    }
    /* Flatter, more "Windows software" corners */
    html.desktop-shell .rounded-lg  { border-radius: 0.25rem !important; }
    html.desktop-shell .rounded-md  { border-radius: 0.25rem !important; }
    html.desktop-shell .rounded-xl  { border-radius: 0.375rem !important; }
    html.desktop-shell .rounded-2xl { border-radius: 0.5rem !important; }
    /* Softer shadows — Vyapar uses very subtle elevation */
    html.desktop-shell .shadow-lg,
    html.desktop-shell .shadow-md  { box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08) !important; }
    html.desktop-shell .shadow-xl  { box-shadow: 0 2px 4px rgba(15, 23, 42, 0.10) !important; }
    /* Crisp 1px input borders (data-entry feel) */
    html.desktop-shell input[type="text"],
    html.desktop-shell input[type="number"],
    html.desktop-shell input[type="search"],
    html.desktop-shell input[type="tel"],
    html.desktop-shell input[type="email"],
    html.desktop-shell input[type="date"],
    html.desktop-shell select,
    html.desktop-shell textarea {
      border-radius: 0.25rem !important;
    }
    /* Thin Windows 11–style scrollbars */
    html.desktop-shell ::-webkit-scrollbar           { width: 10px; height: 10px; }
    html.desktop-shell ::-webkit-scrollbar-track     { background: transparent; }
    html.desktop-shell ::-webkit-scrollbar-thumb     { background: #cbd5e1; border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
    html.desktop-shell ::-webkit-scrollbar-thumb:hover { background: #94a3b8; background-clip: padding-box; border: 2px solid transparent; }

    /* ── Desktop fit fixes ──────────────────────────────────────────────
       The POS / Sales Invoice screens use fixed-height "shells" that were
       tuned for the base font size. On wide screens the app applies a
       readability boost (larger fonts), which makes the top fields row and
       the bottom totals/footer bar taller than those shells — so they were
       getting clipped inside the desktop window. These rules give the shells
       room and let tall pages scroll, so nothing is hidden. Desktop-only
       (injected by the Electron shell); the website is unaffected. */

    /* POS Sales: flex toolbar — height follows content (no gap above items grid) */
    html.desktop-shell .pos-sales-toolbar {
      padding-top: 0.25rem !important;
      padding-bottom: 0.25rem !important;
    }

    /* POS / bill entry — full viewport; no Electron hint-strip gutter */
    html.desktop-shell body.entry-bill-screen .pos-sales-main {
      padding-bottom: 0 !important;
      box-sizing: border-box !important;
    }

    /* Sales Invoice / Purchase Entry: flex column — footer pinned to bottom, lines scroll inside <main>. */
    html.desktop-shell [data-entry-form] {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 1 auto !important;
      min-height: 0 !important;
      height: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
      padding-bottom: 0 !important;
    }

    html.desktop-shell body.entry-bill-screen [data-entry-form] > main {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    html.desktop-shell .entry-page-footer {
      position: static !important;
      flex-shrink: 0 !important;
      bottom: auto !important;
      margin-top: auto !important;
      z-index: 55 !important;
    }

    /* ── Tally / Vyapar keyboard-hint strip (Electron only) ─────────
       A thin chip bar sits ABOVE the existing app status bar and shows
       context-aware F-key shortcuts for the current page. Web/PWA users
       never see this — it is injected from the desktop shell only. */
    #ezzy-hint-bar {
      position: fixed;
      left: 0; right: 0;
      bottom: var(--erp-status-bar-height, 1.75rem);
      height: 22px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      background: #eef2f7;
      border-top: 1px solid #cbd5e1;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      color: #334155;
      z-index: 60;
      pointer-events: none;
      overflow: hidden;
      white-space: nowrap;
    }
    #ezzy-hint-bar .hint {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 6px;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
    }
    #ezzy-hint-bar .hint b {
      font-weight: 600;
      color: #1e3a8a;
      font-family: 'Consolas', 'Menlo', monospace;
    }
    #ezzy-hint-bar .spacer { flex: 1; }
    #ezzy-hint-bar .meta { color: #64748b; font-size: 10px; }
    /* Reserve space for the fixed hint strip — h-screen/100dvh alone clips POS & bill footers */
    html.desktop-shell {
      --ezzy-hint-bar-height: 22px;
    }
    html.desktop-shell .h-screen {
      height: calc(var(--ezzy-viewport-h, 100dvh) - var(--ezzy-hint-bar-height)) !important;
      max-height: calc(var(--ezzy-viewport-h, 100dvh) - var(--ezzy-hint-bar-height)) !important;
    }
    html.desktop-shell body.entry-bill-screen,
    html.desktop-shell body.entry-bill-screen #root {
      height: calc(var(--ezzy-viewport-h, 100dvh) - var(--ezzy-hint-bar-height)) !important;
      max-height: calc(var(--ezzy-viewport-h, 100dvh) - var(--ezzy-hint-bar-height)) !important;
    }

    /* ── Step 5: Multi-document tab strip (Vyapar / browser-style) ─────
       Pins WindowTabsBar to the top of the layout, repaints the tabs as
       square Windows-native document tabs. Web/PWA is unchanged. */
    html.desktop-shell [data-window-tabs-bar] {
      position: sticky !important;
      top: 0;
      z-index: 45;
      background: #e2e8f0 !important;
      border-bottom: 1px solid #94a3b8 !important;
      padding: 2px 6px 0 6px !important;
    }
    html.desktop-shell [data-window-tabs-bar][data-collapsed] {
      padding: 0 6px !important;
      background: #eef2f7 !important;
    }
    /* Square Chrome/Edge-style document tabs */
    html.desktop-shell [data-window-tabs-bar] .group {
      border-radius: 4px 4px 0 0 !important;
      padding: 3px 8px !important;
      height: 24px;
      border: 1px solid transparent !important;
      border-bottom: 0 !important;
      margin-bottom: -1px;
      background: transparent;
      color: #475569;
    }
    html.desktop-shell [data-window-tabs-bar] .group:hover {
      background: #f1f5f9 !important;
    }
    /* Active tab — raised, white, with subtle navy top accent */
    html.desktop-shell [data-window-tabs-bar] .group.bg-background {
      background: #ffffff !important;
      border-color: #94a3b8 !important;
      color: #1e3a8a !important;
      box-shadow: 0 -2px 0 0 #1e3a8a inset, 0 -1px 0 0 #ffffff !important;
      font-weight: 600;
    }
    /* Close (×) always visible on active tab */
    html.desktop-shell [data-window-tabs-bar] .group.bg-background button {
      opacity: 1 !important;
    }
  `;

  // Tally-style keyboard hint strip — path-aware, updated on URL change.
  // Also embeds app version + online status (Step 2 of desktop-feel plan).
  const HINT_BAR_JS = `
    (function () {
      if (window.__ezzyHintBarInstalled) return;
      window.__ezzyHintBarInstalled = true;
      var APP_VERSION = ${JSON.stringify(app.getVersion())};

      /* Full-screen billing pages — no shortcut strip (POS / Sale Bill / Purchase). */
      var NO_HINT_ROUTES = { 'pos-sales': 1, 'sales-invoice': 1, 'purchase-entry': 1 };

      var HINTS = {
        'stock-report':      [['F2','Search'],['Ctrl+E','Export'],['Ctrl+P','Print'],['Esc','Back']],
        'item-wise-sales':   [['F2','Search'],['Ctrl+E','Export'],['Esc','Back']],
        'dashboard':         [['Alt+N','Sale'],['Alt+B','Purchase'],['Alt+P','POS'],['Alt+S','Stock']],
        'accounts':          [['F2','Search'],['Ctrl+P','Print'],['Esc','Back']],
        'daily-tally':       [['F2','Search'],['Ctrl+P','Print'],['Esc','Back']],
        'customer-master':   [['F2','Search'],['Alt+N','New'],['Esc','Back']],
        'supplier-master':   [['F2','Search'],['Alt+N','New'],['Esc','Back']],
        'product-dashboard': [['F2','Search'],['Alt+N','New'],['Esc','Back']],
        'recycle-bin':       [['F2','Search'],['Esc','Back']]
      };
      var DEFAULT_HINTS = [['F1','Help'],['F2','Search'],['Alt+N','New Sale'],['Alt+B','Purchase'],['Alt+P','POS'],['Esc','Back']];

      function key(pathname) {
        var segs = pathname.split('/').filter(Boolean);
        return segs[segs.length - 1] || '';
      }
      function renderChips(arr) {
        return arr.map(function (h) {
          return '<span class="hint"><b>' + h[0] + '</b> ' + h[1] + '</span>';
        }).join('');
      }
      function ensureBar() {
        var bar = document.getElementById('ezzy-hint-bar');
        if (!bar) {
          bar = document.createElement('div');
          bar.id = 'ezzy-hint-bar';
          document.body.appendChild(bar);
        }
        return bar;
      }
      // Viewport CSS vars — ONLY mutate + dispatch resize when dimensions change.
      // Firing resize on every tick breaks Radix dropdowns and causes React Query refetch storms.
      function syncViewport() {
        try {
          var root = document.documentElement;
          var vv = window.visualViewport;
          var w = Math.round((vv && vv.width) ? vv.width : window.innerWidth);
          var h = Math.round((vv && vv.height) ? vv.height : window.innerHeight);
          if (w <= 0 || h <= 0) return;
          var prevW = parseInt(root.style.getPropertyValue('--ezzy-viewport-w'), 10);
          var prevH = parseInt(root.style.getPropertyValue('--ezzy-viewport-h'), 10);
          root.classList.add('entry-viewport-synced');
          if (prevW === w && prevH === h) return;
          root.style.setProperty('--ezzy-viewport-w', w + 'px');
          root.style.setProperty('--entry-vw', w + 'px');
          root.style.setProperty('--ezzy-viewport-h', h + 'px');
          root.style.setProperty('--entry-vh', h + 'px');
          window.dispatchEvent(new Event('resize'));
        } catch (e) {}
      }
      // Route detection + chip innerHTML + online status. NO viewport work here,
      // so the 2s interval never touches the viewport or fires resize.
      function renderHintBar() {
        try {
          var k = key(location.pathname);
          var hideHint = !!NO_HINT_ROUTES[k];
          document.documentElement.style.setProperty(
            '--ezzy-hint-bar-height',
            hideHint ? '0px' : '22px'
          );
          if (hideHint) {
            var hidden = document.getElementById('ezzy-hint-bar');
            if (hidden) hidden.style.display = 'none';
            return;
          }
          var bar = ensureBar();
          bar.style.display = 'flex';
          var hints = HINTS[k] || DEFAULT_HINTS;
          var online = navigator.onLine ? '● Online' : '○ Offline';
          var nextHtml =
            renderChips(hints) +
            '<span class="spacer"></span>' +
            '<span class="meta">' + online + ' · Desktop v' + APP_VERSION + '</span>';
          // Skip pointless DOM mutation when nothing changed (every 2s otherwise).
          if (bar.innerHTML !== nextHtml) bar.innerHTML = nextHtml;
        } catch (e) {}
      }
      // Full update = viewport sync + hint bar. Used only on real navigation / initial paint.
      function onNavigate() {
        syncViewport();
        renderHintBar();
      }

      // React to SPA navigation — these DO re-sync viewport (real layout change).
      var _push = history.pushState;
      var _replace = history.replaceState;
      history.pushState = function () { _push.apply(this, arguments); onNavigate(); };
      history.replaceState = function () { _replace.apply(this, arguments); onNavigate(); };
      window.addEventListener('popstate', onNavigate);
      // online/offline only affects the hint bar label — NOT a viewport trigger.
      window.addEventListener('online', renderHintBar);
      window.addEventListener('offline', renderHintBar);

      // Initial paint — wait for body
      if (document.body) onNavigate();
      else document.addEventListener('DOMContentLoaded', onNavigate);

      // Re-assert every 2s in case SPA re-renders wipe the body children.
      // Interval does NO viewport work — renderHintBar only.
      setInterval(renderHintBar, 2000);
    })();
  `;

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(HEADER_CSS).catch(() => {});
    mainWindow.webContents.executeJavaScript(HINT_BAR_JS).catch(() => {});
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

  // Open external links (target=_blank / window.open) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Navigation allow-list. Only whitelisted hosts load inside the shell (with the
  // preload injected); everything else is pushed to the system browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // OAuth: Supabase authorize returns raw JSON errors in the webview — must open
    // in the system browser. Preserved explicitly (subset of the allow-list rule).
    if (url.includes('supabase.co/auth/v1/authorize')) {
      event.preventDefault();
      shell.openExternal(url);
      return;
    }

    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      // Unparseable (e.g. about:blank, data:) — leave in-shell.
      return;
    }

    const allowed =
      ALLOWED_NAV_HOSTS.includes(host) && (host !== 'localhost' || isDev);
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

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
        click: () => shell.openExternal(params.linkURL),
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
      accelerator: 'F5',
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
    if (!app.isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// System tray (app keeps running in the background when window is closed)
function createTray() {
  const icon = resolveIcon();
  if (!icon) {
    // No icon available yet — skip tray so close acts as a normal quit.
    return;
  }

  tray = new Tray(icon.image);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open EzzyERP',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          notifyRendererLayoutSync();
        }
      },
    },
    {
      label: 'Refresh App',
      click: () => manualReloadMainWindow('tray-menu'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('EzzyERP — Smart Inventory & Billing');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      notifyRendererLayoutSync();
    }
  });
}

function sendNavigateShortcut(path) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('erp-navigate', path);
}

// ── Step 8: System printer pinning ─────────────────────────────────
// Lists OS printers and saves the user's pick to localStorage under the
// existing PRINT_PREF_KEYS used by src/utils/appPrint.ts — so the entire
// silent-print pipeline (invoices, thermal receipts, barcodes) picks it up
// without any web-side change.
const PRINTER_PREF_KEY = {
  invoice: 'ezzy_invoice_printer',
  receipt: 'ezzy_thermal_printer',
  barcode: 'ezzy_barcode_printer',
};
const PRINTER_LABEL = {
  invoice: 'A4 / Invoice Printer',
  receipt: 'Thermal Receipt Printer',
  barcode: 'Barcode Label Printer',
};

async function chooseDefaultPrinter(kind) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  let printers = [];
  try {
    const wc = mainWindow.webContents;
    printers =
      typeof wc.getPrintersAsync === 'function'
        ? await wc.getPrintersAsync()
        : wc.getPrinters();
  } catch {
    printers = [];
  }

  if (!printers || printers.length === 0) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Default Printer',
      message: 'No printers found',
      detail: 'Install/connect a printer in Windows Settings and try again.',
      buttons: ['OK'],
    });
    return;
  }

  const prefKey = PRINTER_PREF_KEY[kind];
  const current =
    (await mainWindow.webContents
      .executeJavaScript(`localStorage.getItem(${JSON.stringify(prefKey)})`)
      .catch(() => '')) || '';

  const names = printers.map((p) => p.displayName || p.name);
  // showMessageBox supports up to a reasonable number of buttons; if too many
  // we still show them — Windows will scroll.
  const buttons = [...names, 'Clear', 'Cancel'];
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    title: `Default ${PRINTER_LABEL[kind]}`,
    message: `Pick the ${PRINTER_LABEL[kind]}`,
    detail: current ? `Currently set: ${current}` : 'No printer pinned yet.',
    buttons,
    cancelId: buttons.length - 1,
    noLink: true,
  });

  if (result === buttons.length - 1) return; // Cancel
  if (result === buttons.length - 2) {
    // Clear
    await mainWindow.webContents
      .executeJavaScript(`localStorage.removeItem(${JSON.stringify(prefKey)})`)
      .catch(() => {});
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Default Printer',
      message: `${PRINTER_LABEL[kind]} cleared.`,
      buttons: ['OK'],
    });
    return;
  }

  const picked = printers[result];
  const pickedName = picked.name; // exact device name needed by Electron print API
  await mainWindow.webContents
    .executeJavaScript(
      `localStorage.setItem(${JSON.stringify(prefKey)}, ${JSON.stringify(pickedName)})`,
    )
    .catch(() => {});
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Default Printer',
    message: `${PRINTER_LABEL[kind]} set to:`,
    detail: picked.displayName || pickedName,
    buttons: ['OK'],
  });
}

// Application menu — Tally / Vyapar style. All items navigate via
// sendNavigateShortcut (existing IPC) — no new routes, no business logic.
// Accelerators avoid F1–F11 so POS shortcuts keep working.
function createMenu() {
  const nav = (p) => () => sendNavigateShortcut(p);

  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'New Sale Invoice', accelerator: 'Alt+N', click: nav('sales-invoice') },
        { label: 'New Purchase Bill', accelerator: 'Alt+B', click: nav('purchase-entry') },
        { label: 'New POS Sale', accelerator: 'Alt+P', click: nav('pos-sales') },
        { type: 'separator' },
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () =>
            mainWindow &&
            mainWindow.webContents.print({ silent: false, printBackground: true }, () => {}),
        },
        {
          label: 'Refresh App',
          accelerator: 'F5',
          click: () => manualReloadMainWindow('file-menu'),
        },
        { type: 'separator' },
        { label: 'Backup', click: nav('settings/backup') },
        { type: 'separator' },
        {
          label: 'Default Printer…',
          click: () => chooseDefaultPrinter('invoice'),
        },
        {
          label: 'Default Receipt Printer (Thermal)…',
          click: () => chooseDefaultPrinter('receipt'),
        },
        {
          label: 'Default Barcode Printer…',
          click: () => chooseDefaultPrinter('barcode'),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { app.isQuitting = true; app.quit(); },
        },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&Masters',
      submenu: [
        { label: 'Customers', click: nav('customers') },
        { label: 'Suppliers', click: nav('suppliers') },
        { label: 'Products', click: nav('products') },
        { label: 'Categories', click: nav('categories') },
      ],
    },
    {
      label: '&Transactions',
      submenu: [
        { label: 'POS Sale', accelerator: 'Alt+P', click: nav('pos-sales') },
        { label: 'Sale Invoice', accelerator: 'Alt+N', click: nav('sales-invoice') },
        { label: 'Purchase Bill', accelerator: 'Alt+B', click: nav('purchase-entry') },
        { type: 'separator' },
        { label: 'Sale Return', click: nav('sale-returns') },
        { label: 'Purchase Return', click: nav('purchase-returns') },
        { type: 'separator' },
        { label: 'Receipt (Customer Payment)', click: nav('customer-payments') },
        { label: 'Payment (Supplier Payment)', click: nav('supplier-payments') },
        { label: 'Expense Entry', click: nav('expenses') },
      ],
    },
    {
      label: '&Reports',
      submenu: [
        { label: 'Dashboard', accelerator: 'Alt+D', click: nav('dashboard') },
        { type: 'separator' },
        { label: 'Day Book', click: nav('day-book') },
        { label: 'Stock Report', accelerator: 'Alt+S', click: nav('stock-report') },
        { label: 'Item-Wise Sales', click: nav('item-wise-sales') },
        { type: 'separator' },
        { label: 'GSTR-1', click: nav('gst/gstr1') },
        { label: 'GSTR-3B', click: nav('gst/gstr3b') },
        { type: 'separator' },
        { label: 'Outstanding (Customers)', click: nav('outstanding-customers') },
        { label: 'Outstanding (Suppliers)', click: nav('outstanding-suppliers') },
        { label: 'Profit & Loss', click: nav('accounts/profit-loss') },
      ],
    },
    {
      label: '&Utilities',
      submenu: [
        { label: 'Stock Settlement', click: nav('stock-settlement') },
        { label: 'Recycle Bin', click: nav('recycle-bin') },
        { label: 'User Rights', click: nav('settings/user-rights') },
        { label: 'WhatsApp Inbox', click: nav('whatsapp-inbox') },
      ],
    },
    {
      label: '&Window',
      submenu: [
        {
          label: 'Refresh App',
          accelerator: 'F5',
          click: () => manualReloadMainWindow('window-menu'),
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => manualReloadMainWindow('window-menu-ctrl-r'),
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => stepZoom(+1),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => stepZoom(-1),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => applyZoomFactor(1.0),
        },
        { type: 'separator' },
        {
          label: 'Full Screen',
          accelerator: 'F11',
          click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        ...(isDev
          ? [{
              label: 'Toggle Developer Tools',
              accelerator: 'F12',
              click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
            }]
          : []),
        { role: 'minimize' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Keyboard Shortcuts',
              message: 'EzzyERP — Keyboard Shortcuts',
              detail:
                'Alt+N   New Sale Invoice\n' +
                'Alt+B   New Purchase Bill\n' +
                'Alt+P   POS Sale\n' +
                'Alt+S   Stock Report\n' +
                'Alt+D   Dashboard\n' +
                'F5      Refresh app\n' +
                'Ctrl+R  Refresh app\n' +
                'Ctrl+P  Print\n' +
                'F1      Help (in-app)\n' +
                'F2      Search (in-app)\n' +
                'F9      Save (in-app)\n' +
                'F10     Print preview (in-app)\n' +
                'F11     Full Screen\n' +
                'Esc     Back / Cancel',
              buttons: ['OK'],
            });
          },
        },
        { label: 'Check for Updates…', click: () => checkForUpdatesManually() },
        { type: 'separator' },
        { label: 'WhatsApp Support', click: () => shell.openExternal(SUPPORT_WHATSAPP_URL) },
        { label: 'Visit Website', click: () => shell.openExternal(PROD_URL) },
        { type: 'separator' },
        {
          label: 'About EzzyERP',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About EzzyERP',
              message: 'EzzyERP — Smart Inventory & Billing',
              detail: `Version ${app.getVersion()}\nCopyright © ${new Date().getFullYear()} EzzyERP`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Keep accelerators (Alt+N, F5, Ctrl+P…) but never show the white OS menu bar.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(false);
  }
}

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

ipcMain.handle('check-for-updates', async (_event, interactive = true) => {
  checkForUpdatesManually(!!interactive);
  return { success: true };
});

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

// ═══ PRINTER IPC ═══
// Silent/direct printing so the desktop app prints like Tally/Vyapar (no dialog).
// All handlers degrade gracefully and never throw across the IPC boundary.

function targetWindow() {
  return BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0] || null;
}

// List connected printers
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

ipcMain.handle('get-printers', async () => {
  const win = targetWindow();
  if (!win) return [];
  try {
    const printers =
      typeof win.webContents.getPrintersAsync === 'function'
        ? await win.webContents.getPrintersAsync()
        : win.webContents.getPrinters();
    return (printers || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      status: p.status,
      isDefault: !!p.isDefault,
    }));
  } catch (err) {
    return [];
  }
});

// Silent print the current page — no dialog
ipcMain.handle('silent-print', async (_event, options = {}) => {
  const win = targetWindow();
  if (!win) return { success: false, error: 'No window' };

  return new Promise((resolve) => {
    try {
      win.webContents.print(
        {
          silent: true,
          deviceName: options.printerName || '',
          pageSize: options.pageSize || 'A4',
          copies: options.copies || 1,
          landscape: options.landscape || false,
          margins: options.margins || { marginType: 'default' },
          scaleFactor: options.scaleFactor || 100,
          printBackground: true,
          color: options.color !== false,
        },
        (success, failureReason) => resolve({ success, error: failureReason || null }),
      );
    } catch (err) {
      resolve({ success: false, error: String(err && err.message ? err.message : err) });
    }
  });
});

// Render a PDF buffer of the current page (for preview/save)
ipcMain.handle('print-to-pdf', async (_event, options = {}) => {
  const win = targetWindow();
  if (!win) return null;
  try {
    const pdfData = await win.webContents.printToPDF({
      pageSize: options.pageSize || 'A4',
      landscape: options.landscape || false,
      margins: options.margins || { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      printBackground: true,
    });
    return pdfData;
  } catch (err) {
    return null;
  }
});

// Print an arbitrary HTML string via an offscreen window (receipts/invoices/labels)
ipcMain.handle('print-html', async (_event, payload = {}) => {
  const {
    html,
    printerName,
    pageSize,
    copies,
    margins,
    landscape,
    silent,
    printKind,
    preferCSSPageSize,
  } = payload;
  if (!html) return { success: false, error: 'No HTML provided' };

  const printSilent = silent !== false;
  const isReceipt =
    printKind === 'receipt' ||
    (typeof pageSize === 'object' &&
      pageSize &&
      Number(pageSize.width) >= 58000 &&
      Number(pageSize.width) <= 82000);

  return new Promise((resolve) => {
    let printWin = new BrowserWindow({
      show: !printSilent,
      width: isReceipt ? 340 : 800,
      height: isReceipt ? 900 : 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    // Offscreen print surface only ever loads the provided data: URL —
    // block any window.open and any navigation away from it.
    printWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    printWin.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        if (printWin && !printWin.isDestroyed()) printWin.close();
      } catch {}
      printWin = null;
      resolve(result);
    };

    // Safety timeout so a stuck render never hangs the renderer's await
    const timeout = setTimeout(() => finish({ success: false, error: 'Print timed out' }), 15000);

    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        try {
          printWin.webContents.print(
            {
              silent: printSilent,
              deviceName: printerName || '',
              pageSize: pageSize || 'A4',
              copies: copies || 1,
              landscape: landscape || false,
              margins: isReceipt
                ? { marginType: 'none' }
                : margins || { marginType: 'default' },
              printBackground: true,
              preferCSSPageSize: !!preferCSSPageSize || isReceipt,
            },
            (success, failureReason) => {
              clearTimeout(timeout);
              finish({ success, error: failureReason || null });
            },
          );
        } catch (err) {
          clearTimeout(timeout);
          finish({ success: false, error: String(err && err.message ? err.message : err) });
        }
      }, 300);
    });

    printWin
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch((err) => {
        clearTimeout(timeout);
        finish({ success: false, error: String(err && err.message ? err.message : err) });
      });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents
      .executeJavaScript(
        `(function () {
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
        })();`,
      )
      .catch(() => {});
  }
});
