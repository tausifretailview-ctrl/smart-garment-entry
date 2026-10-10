const { app, dialog, ipcMain, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');

let getMainWindow = () => null;
let onUpdateReady = () => {};

function bindGetMainWindow(fn) {
  getMainWindow = fn;
}

/** Called once an update has finished downloading (main.cjs adds a tray item). */
function bindOnUpdateReady(fn) {
  onUpdateReady = fn;
}

// ═══ AUTO-UPDATE ═══
// Checks GitHub Releases on launch and every few hours (only in the installed
// Setup app), downloads in the background, and installs when the app quits.
//
// Never pop a modal while the shop is billing: a barcode scanner ends every
// scan with Enter, which would press the dialog's default button (and a
// "Restart now" default would wipe the open bill). Update news goes to a
// Windows notification + the tray menu; restarting is always the user's click.

const PERIODIC_CHECK_MS = 4 * 60 * 60 * 1000; // shops leave the app open for days

let updaterWired = false;
let periodicTimer = null;
let downloadedVersion = null;

function isUpdateReady() {
  return !!downloadedVersion;
}

function showUpdateNotification(title, body, onClick) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: true });
    if (onClick) n.on('click', onClick);
    n.show();
  } catch {}
}

/** User-initiated only (tray item, notification click, Help menu). */
async function promptRestartToUpdate() {
  if (!downloadedVersion) return;
  const win = getMainWindow();
  const opts = {
    type: 'info',
    buttons: ['Later', 'Restart now'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Update ready',
    message: `EzzyERP ${downloadedVersion} is ready to install.`,
    detail:
      'Finish and save the current bill first. Restart now closes EzzyERP, installs the update and opens it again. ' +
      'If you choose Later, it installs automatically the next time EzzyERP is closed from the tray (Quit).',
  };
  try {
    const { response } = win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    if (response === 1) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  } catch {}
}

function checkQuietly() {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[auto-updater] check failed', err && err.message ? err.message : err);
  });
}

function initAutoUpdater() {
  // Updates only work in the packaged, installed app (needs app-update.yml).
  // Skipped in dev and harmless for the portable build (errors are swallowed).
  if (!app.isPackaged) return;

  if (!updaterWired) {
    updaterWired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log('[auto-updater] downloading', info && info.version);
    });

    autoUpdater.on('update-downloaded', (info) => {
      downloadedVersion = (info && info.version) || 'new';
      try { onUpdateReady(downloadedVersion); } catch {}
      showUpdateNotification(
        'EzzyERP update ready',
        `Version ${downloadedVersion} installs when you next close EzzyERP. Click here to restart now.`,
        () => { void promptRestartToUpdate(); },
      );
    });

    autoUpdater.on('error', (err) => {
      console.error('[auto-updater]', err == null ? 'unknown error' : err);
    });

    if (!periodicTimer) {
      periodicTimer = setInterval(() => {
        if (!downloadedVersion) checkQuietly();
      }, PERIODIC_CHECK_MS);
    }
  }

  checkQuietly();
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
    dialog.showMessageBox(getMainWindow(), {
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates are only available in the installed desktop app.',
      buttons: ['OK'],
    });
    return;
  }
  if (downloadedVersion) {
    if (interactive) void promptRestartToUpdate();
    return;
  }
  initAutoUpdater();
  autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (!interactive) return;
      const latest = result && result.updateInfo ? result.updateInfo.version : null;
      const current = app.getVersion();
      if (latest && latest !== current) {
        dialog.showMessageBox(getMainWindow(), {
          type: 'info',
          title: 'Check for Updates',
          message: `EzzyERP ${latest} is downloading in the background.`,
          detail: 'You can keep working. A notification appears when it is ready to install.',
          buttons: ['OK'],
        });
        return;
      }
      dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Check for Updates',
        message: `You're on the latest desktop version (${current}).`,
        detail: 'Press Ctrl+R or use Refresh App to load the newest web features from the server.',
        buttons: ['OK'],
      });
    })
    .catch((err) => {
      console.warn('[auto-updater] manual check failed', err);
      if (!interactive) return;
      const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
      dialog.showMessageBox(getMainWindow(), {
        type: isUpdaterUnavailableError(err) ? 'info' : 'error',
        title: 'Check for Updates',
        message: portable
          ? 'The portable version does not update itself.'
          : 'Could not check for updates right now.',
        detail: portable
          ? 'Download the latest EzzyERP from the install page, or use the Setup installer to get automatic updates.'
          : 'Press Ctrl+R to refresh the app from the server, or try again later.',
        buttons: ['OK'],
      });
    });
}



function registerUpdaterIpc() {
  ipcMain.handle('check-for-updates', async (_event, interactive = true) => {
    checkForUpdatesManually(!!interactive);
    return { success: true };
  });
}

module.exports = {
  bindGetMainWindow,
  bindOnUpdateReady,
  initAutoUpdater,
  checkForUpdatesManually,
  isUpdateReady,
  promptRestartToUpdate,
  registerUpdaterIpc,
};
