const { app, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let getMainWindow = () => null;

function bindGetMainWindow(fn) {
  getMainWindow = fn;
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
      dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Update available',
        message: `EzzyERP ${ver} is downloading in the background.`,
        detail: 'You will be prompted to restart when the update is ready. You can keep working meanwhile.',
        buttons: ['OK'],
      }).catch(() => {});
    });

    autoUpdater.on('update-downloaded', (info) => {
      const choice = dialog.showMessageBoxSync(getMainWindow(), {
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
    dialog.showMessageBox(getMainWindow(), {
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
        dialog.showMessageBox(getMainWindow(), {
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
      dialog.showMessageBox(getMainWindow(), {
        type: 'error',
        title: 'Update check failed',
        message: 'Could not check for updates.',
        detail: 'Press F5 to refresh the app from the server, or try again later.',
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
  initAutoUpdater,
  checkForUpdatesManually,
  registerUpdaterIpc,
};
