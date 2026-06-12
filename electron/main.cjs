const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { showSplash, closeSplash } = require('./splash.cjs');

// Dev = running from source (electron .), Prod = packaged .exe.
// Using app.isPackaged avoids an extra runtime dependency.
const isDev = !app.isPackaged;

const PROD_URL = 'https://app.inventoryshop.in';
const DEV_URL = 'http://localhost:8080';
const SUPABASE_URL = 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';

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

// Single instance lock — prevent multiple copies running simultaneously
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      ensureMainWindowMaximized();
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

// Manual "Check for Updates" trigger (used by the Help menu).
function checkForUpdatesManually() {
  if (!app.isPackaged) {
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
      const latest = result && result.updateInfo ? result.updateInfo.version : null;
      if (latest && latest === app.getVersion()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Check for Updates',
          message: `You're on the latest version (${app.getVersion()}).`,
          buttons: ['OK'],
        });
      }
    })
    .catch((err) => {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update check failed',
        message: 'Could not check for updates.',
        detail: String(err && err.message ? err.message : err),
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
  // Auto-reload disabled per user request — keep window sticky with existing data.
  // User can manually refresh via F5, Ctrl+R, right-click, or File → Refresh App.
  console.warn('[EzzyERP] Skipping auto-reload (disabled):', reason);
}

/** User-initiated full reload (menu, F5, right-click, in-app button). */
function manualReloadMainWindow(source) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  loadRetryCount = 0;
  console.log('[EzzyERP] Manual refresh:', source || 'unknown');
  mainWindow.webContents.reload();
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

/** Mimics the manual maximize/restore resize that fixes clipped footers in the WebView. */
function notifyRendererLayoutSync() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      'window.dispatchEvent(new Event("resize")); if (document.visibilityState === "visible") document.dispatchEvent(new Event("visibilitychange"));',
    )
    .catch(() => {});
}

function createWindow() {
  const icon = resolveIcon();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    maximized: true,
    title: 'EzzyERP — Smart Inventory & Billing',
    ...(icon ? { icon: icon.image } : {}),

    // Native Windows chrome — gives the Tally / Vyapar "desktop software" feel.
    // Title bar + menu bar are visible at the top, drawn by Windows itself.
    autoHideMenuBar: false,

    backgroundColor: '#F5F7FA', // match index.html splash — no white flash on Windows cold start
    show: false, // Show after ready-to-show (branded splash in page)

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      zoomFactor: 0.8, // medium zoom — content was too large at 100%
      backgroundThrottling: false,
    },
  });

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

  // Auto-reload on network/CDN failure disabled — user reloads manually if needed.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return;
    console.warn('[EzzyERP] did-fail-load (auto-reload disabled):', errorCode);
  });

  // Renderer crash — log only, no auto-reload. User keeps window state.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[EzzyERP] render-process-gone (auto-reload disabled):', details);
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

    /* Sales Invoice / Purchase Entry: scroll when tall; keep room above the
       fixed ERP status bar so Save Invoice / Save Bill is never covered. */
    [data-entry-form] {
      height: auto !important;
      min-height: calc(100dvh - var(--ezzy-hint-bar-height, 22px));
      max-height: calc(100dvh - var(--ezzy-hint-bar-height, 22px));
      overflow-y: auto !important;
      padding-bottom: var(--erp-status-bar-height, 1.75rem) !important;
    }

    .entry-page-footer {
      position: sticky !important;
      bottom: var(--erp-status-bar-height, 1.75rem) !important;
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
      height: calc(100dvh - var(--ezzy-hint-bar-height)) !important;
      max-height: calc(100dvh - var(--ezzy-hint-bar-height)) !important;
    }
    html.desktop-shell body.entry-bill-screen,
    html.desktop-shell body.entry-bill-screen #root {
      height: calc(100dvh - var(--ezzy-hint-bar-height)) !important;
      max-height: calc(100dvh - var(--ezzy-hint-bar-height)) !important;
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

      var HINTS = {
        'pos-sales':         [['F2','Search'],['F4','Customer'],['F9','Save'],['F10','Print'],['Esc','Back']],
        'sales-invoice':     [['F2','Search'],['F4','Customer'],['F9','Save'],['F11','Print'],['Esc','Back']],
        'purchase-entry':    [['F2','Search'],['F4','Supplier'],['F9','Save'],['Esc','Back']],
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
      function update() {
        try {
          var bar = ensureBar();
          var k = key(location.pathname);
          var hints = HINTS[k] || DEFAULT_HINTS;
          var online = navigator.onLine ? '● Online' : '○ Offline';
          bar.innerHTML =
            renderChips(hints) +
            '<span class="spacer"></span>' +
            '<span class="meta">' + online + ' · Desktop v' + APP_VERSION + '</span>';
        } catch (e) {}
      }

      // React to SPA navigation
      var _push = history.pushState;
      var _replace = history.replaceState;
      history.pushState = function () { _push.apply(this, arguments); update(); };
      history.replaceState = function () { _replace.apply(this, arguments); update(); };
      window.addEventListener('popstate', update);
      window.addEventListener('online', update);
      window.addEventListener('offline', update);

      // Initial paint — wait for body
      if (document.body) update();
      else document.addEventListener('DOMContentLoaded', update);

      // Re-assert every 2s in case SPA re-renders wipe the body children
      setInterval(update, 2000);
    })();
  `;

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(HEADER_CSS).catch(() => {});
    mainWindow.webContents.executeJavaScript(HINT_BAR_JS).catch(() => {});
    // zoomFactor is already applied via webPreferences — no need to re-set it
    // here (was causing a one-time layout reflow after first paint).
  });

  // Show maximized by default so bill entry footers and fields fit without manual resize
  mainWindow.once('ready-to-show', () => {
    try { closeSplash(); } catch {}
    ensureMainWindowMaximized();
    mainWindow.show();
    mainWindow.focus();
    setTimeout(() => {
      ensureMainWindowMaximized();
      notifyRendererLayoutSync();
    }, 80);
    setTimeout(notifyRendererLayoutSync, 400);
  });

  mainWindow.on('show', () => {
    ensureMainWindowMaximized();
    setTimeout(notifyRendererLayoutSync, 50);
  });

  mainWindow.on('maximize', () => {
    setTimeout(notifyRendererLayoutSync, 50);
  });

  // Open external links (target=_blank / window.open) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // OAuth URLs return raw JSON errors inside the Electron webview — use system browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('supabase.co/auth/v1/authorize')) {
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
          ensureMainWindowMaximized();
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
      ensureMainWindowMaximized();
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
          click: () => mainWindow && mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow && mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow && mainWindow.webContents.setZoomLevel(0),
        },
        { type: 'separator' },
        {
          label: 'Full Screen',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
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
                'F12     Full Screen\n' +
                'Esc     Back / Cancel',
              buttons: ['OK'],
            });
          },
        },
        { label: 'Check for Updates…', click: () => checkForUpdatesManually() },
        { type: 'separator' },
        { label: 'WhatsApp Support', click: () => shell.openExternal('https://wa.me/919876543210') },
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
}

ipcMain.handle('reload-app', async () => {
  manualReloadMainWindow('ipc');
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
});
