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
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
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
  console.warn('[EzzyERP] Reloading window:', reason);
  loadRetryCount += 1;
  if (loadRetryCount > MAX_LOAD_RETRIES) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Connection problem',
      message: 'EzzyERP could not load the application.',
      detail: 'Check your internet connection, then use View → Reload or restart the app.',
      buttons: ['OK'],
    }).catch(() => {});
    loadRetryCount = 0;
    return;
  }
  // First retry fast (400ms), then back off — recovers instantly from a brief flap.
  const delay = loadRetryCount === 1 ? 400 : Math.min(1500 * loadRetryCount, 6000);
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  }, delay);
}

function createWindow() {
  const icon = resolveIcon();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
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
  });

  // Network / CDN failure — retry instead of leaving a blank window
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — navigation cancelled
    reloadMainWindow(`did-fail-load (${errorCode})`);
  });

  // Renderer crash (common when too many heavy pages stay mounted) — auto-recover
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[EzzyERP] render-process-gone:', details);
    reloadMainWindow(`render-process-gone (${details && details.reason ? details.reason : 'unknown'})`);
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
      loadRetryCount = 0;
      mainWindow.webContents.reload();
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

    /* POS Sales: enlarge the top field toolbar so the field labels above the
       inputs are no longer clipped. The variable drives both the toolbar
       height and the items-body offset, so they stay in sync. */
    .pos-sales-main {
      --pos-toolbar-h: 136px !important;
    }

    /* Sales Invoice / Purchase Entry: scroll when tall; keep room above the
       fixed ERP status bar so Save Invoice / Save Bill is never covered. */
    [data-entry-form] {
      height: auto !important;
      min-height: 100vh;
      overflow-y: auto !important;
      padding-bottom: var(--erp-status-bar-height, 1.75rem) !important;
    }

    .entry-page-footer {
      position: sticky !important;
      bottom: var(--erp-status-bar-height, 1.75rem) !important;
      z-index: 55 !important;
    }
  `;

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(HEADER_CSS).catch(() => {});
    // zoomFactor is already applied via webPreferences — no need to re-set it
    // here (was causing a one-time layout reflow after first paint).
  });

  // Show maximized by default so bill entry footers and fields fit without manual resize
  mainWindow.once('ready-to-show', () => {
    try { closeSplash(); } catch {}
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links (target=_blank / window.open) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
      label: 'Print…',
      accelerator: 'CmdOrCtrl+P',
      click: () => mainWindow.webContents.print({ silent: false, printBackground: true }, () => {}),
    });
    items.push({ role: 'reload', accelerator: 'CmdOrCtrl+R' });

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
        }
      },
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
    }
  });
}

function sendNavigateShortcut(path) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('erp-navigate', path);
}

// Application menu — accelerators must not steal POS F1–F10 (only F11 was conflicting; use F12 for fullscreen).
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Dashboard', accelerator: 'Alt+D', click: () => sendNavigateShortcut('dashboard') },
        { type: 'separator' },
        { label: 'POS Sale', accelerator: 'Alt+P', click: () => sendNavigateShortcut('pos-sales') },
        { label: 'Sale Invoice', accelerator: 'Alt+N', click: () => sendNavigateShortcut('sales-invoice') },
        { label: 'Purchase Bill', accelerator: 'Alt+B', click: () => sendNavigateShortcut('purchase-entry') },
        { label: 'Stock Report', accelerator: 'Alt+S', click: () => sendNavigateShortcut('stock-report') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        {
          label: 'Full Screen',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () =>
            mainWindow &&
            mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () =>
            mainWindow &&
            mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow && mainWindow.webContents.setZoomLevel(0),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => checkForUpdatesManually(),
        },
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
        {
          label: 'WhatsApp Support',
          click: () => shell.openExternal('https://wa.me/919876543210'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

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
