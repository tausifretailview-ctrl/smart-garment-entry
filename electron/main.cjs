const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Dev = running from source (electron .), Prod = packaged .exe.
// Using app.isPackaged avoids an extra runtime dependency.
const isDev = !app.isPackaged;

const PROD_URL = 'https://app.inventoryshop.in';
const DEV_URL = 'http://localhost:8080';

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

function createWindow() {
  const icon = resolveIcon();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'EzzyERP — Smart Inventory & Billing',
    ...(icon ? { icon: icon.image } : {}),

    // Single-header look: hide the native title bar and the menu bar so the app's
    // own navy header is the top of the window. Keep the Windows min/max/close
    // buttons as an overlay tinted to match the header (#1e40af).
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e40af',
      symbolColor: '#ffffff',
      height: 36,
    },
    autoHideMenuBar: true, // hide menu bar (accelerators still work; Alt reveals)

    backgroundColor: '#f8fafc',
    show: false, // Show after ready-to-show (no white flash)

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      zoomFactor: 0.8, // medium zoom — content was too large at 100%
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(PROD_URL);
  }

  // Make the app's navy header act as the title bar (draggable) and keep its
  // right-side icons clear of the window control buttons. Injected only inside
  // the desktop app, so the deployed website is unaffected. Re-applied on every
  // full load; persists across in-app (SPA) navigation.
  const HEADER_CSS = `
    [class~="bg-[#1e40af]"] {
      -webkit-app-region: drag;
      padding-right: 150px !important;
    }
    [class~="bg-[#1e40af]"] button,
    [class~="bg-[#1e40af]"] a,
    [class~="bg-[#1e40af]"] input,
    [class~="bg-[#1e40af]"] select,
    [class~="bg-[#1e40af]"] [role="button"],
    [class~="bg-[#1e40af]"] [contenteditable] {
      -webkit-app-region: no-drag;
    }

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

    /* Sales Invoice (and other full-height entry forms): if the content is
       taller than the window, allow the page to scroll instead of hard-
       clipping the bottom totals bar / top fields. */
    [data-entry-form] {
      height: auto !important;
      min-height: 100vh;
      overflow-y: auto !important;
      padding-bottom: 0 !important;
    }
  `;

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(HEADER_CSS).catch(() => {});
    mainWindow.webContents.setZoomFactor(0.8);
  });

  // Show window smoothly after content loads
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links (target=_blank / window.open) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
  const { html, printerName, pageSize, copies, margins, landscape, silent } = payload;
  if (!html) return { success: false, error: 'No HTML provided' };

  const printSilent = silent !== false;

  return new Promise((resolve) => {
    let printWin = new BrowserWindow({
      show: !printSilent,
      width: 800,
      height: 600,
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
              margins: margins || { marginType: 'default' },
              printBackground: true,
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
