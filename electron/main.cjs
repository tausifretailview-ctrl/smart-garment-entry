const { app, BrowserWindow, Menu, Tray, dialog } = require('electron');
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
const { parseOrgSlugFromHref, writeSavedOrgSlug } = require('./startupUrl.cjs');
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
  app.on('second-instance', (_event, argv) => {
    const mainWindow = getMainWindow();
    const protocolHref = Array.isArray(argv)
      ? argv.find((arg) => typeof arg === 'string' && arg.startsWith('ezzyerp:'))
      : null;
    const slug = parseOrgSlugFromHref(protocolHref);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      if (slug) {
        writeSavedOrgSlug(app.getPath('userData'), slug);
        mainWindow.loadURL(`${PROD_URL}/${slug}`);
      }
      mainWindow.focus();
      notifyRendererLayoutSync();
    }
  });

  if (!app.isDefaultProtocolClient('ezzyerp')) {
    app.setAsDefaultProtocolClient('ezzyerp');
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    const slug = parseOrgSlugFromHref(url);
    const mainWindow = getMainWindow();
    if (slug && mainWindow && !mainWindow.isDestroyed()) {
      writeSavedOrgSlug(app.getPath('userData'), slug);
      mainWindow.loadURL(`${PROD_URL}/${slug}`);
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
        if (getMainWindow()) {
          getMainWindow().show();
          getMainWindow().focus();
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
    if (getMainWindow()) {
      getMainWindow().show();
      getMainWindow().focus();
      notifyRendererLayoutSync();
    }
  });
}



function sendNavigateShortcut(path) {
  if (!getMainWindow() || getMainWindow().isDestroyed()) return;
  getMainWindow().show();
  getMainWindow().focus();
  getMainWindow().webContents.send('erp-navigate', path);
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
            getMainWindow() &&
            getMainWindow().webContents.print({ silent: false, printBackground: true }, () => {}),
        },
        {
          label: 'Refresh App',
          accelerator: 'CmdOrCtrl+R',
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
          // No F5 / Ctrl+R here — File menu owns Ctrl+R; F5 is reserved for POS Sale Return.
          label: 'Refresh App',
          click: () => manualReloadMainWindow('window-menu'),
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
          // No F11 accelerator — POS uses F11 for Size-wise Stock.
          label: 'Full Screen',
          click: () => getMainWindow() && getMainWindow().setFullScreen(!getMainWindow().isFullScreen()),
        },
        ...(isDev
          ? [{
              label: 'Toggle Developer Tools',
              accelerator: 'F12',
              click: () => getMainWindow() && getMainWindow().webContents.toggleDevTools(),
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
            dialog.showMessageBox(getMainWindow(), {
              type: 'info',
              title: 'Keyboard Shortcuts',
              message: 'EzzyERP — Keyboard Shortcuts',
              detail:
                'Alt+N   New Sale Invoice\n' +
                'Alt+B   New Purchase Bill\n' +
                'Alt+P   POS Sale\n' +
                'Alt+S   Stock Report\n' +
                'Alt+D   Dashboard\n' +
                'Ctrl+R  Refresh app\n' +
                'Ctrl+P  Print\n' +
                'Ctrl+K  Command palette\n' +
                'F1–F11  POS actions (in-app; see Shortcuts)\n' +
                'Esc     Back / Cancel',
              buttons: ['OK'],
            });
          },
        },
        { label: 'Check for Updates…', click: () => checkForUpdatesManually() },
        { type: 'separator' },
        { label: 'WhatsApp Support', click: () => { void openExternalSafely(SUPPORT_WHATSAPP_URL); } },
        { label: 'Visit Website', click: () => { void openExternalSafely(PROD_URL); } },
        { type: 'separator' },
        {
          label: 'About EzzyERP',
          click: () => {
            dialog.showMessageBox(getMainWindow(), {
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

  // Keep accelerators (Alt+N, Ctrl+R, Ctrl+P…) but never show the white OS menu bar.
  // F1–F11 are reserved for in-app POS shortcuts — never bind them as menu accelerators.
  if (getMainWindow() && !getMainWindow().isDestroyed()) {
    getMainWindow().setMenuBarVisibility(false);
    getMainWindow().setAutoHideMenuBar(false);
  }
}



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
