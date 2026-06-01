const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Dev = running from source (electron .), Prod = packaged .exe.
// Using app.isPackaged avoids an extra runtime dependency.
const isDev = !app.isPackaged;

const PROD_URL = 'https://inventoryshop.in';
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

    // Professional appearance — native OS frame (min/max/close), no browser chrome
    backgroundColor: '#f8fafc',
    show: false, // Show after ready-to-show (no white flash)

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(PROD_URL);
  }

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

// Application menu — only items that work without modifying the web app
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
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        {
          label: 'Full Screen',
          accelerator: 'F11',
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
