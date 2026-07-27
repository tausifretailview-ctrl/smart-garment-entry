const { shell, ipcMain } = require('electron');

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

const SUPPORT_WHATSAPP_URL = 'https://wa.me/918424034844';

/**
 * Open http(s) URLs in the system browser only.
 * Custom protocols / non-http schemes are dropped silently — never throw
 * across IPC or navigation handlers.
 */
async function openExternalSafely(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return false;
  }
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach window-open + will-navigate allow-list to a webContents.
 * @param {Electron.WebContents} webContents
 * @param {{ isDev: boolean }} opts
 */
function attachShellNavigation(webContents, { isDev }) {
  // Open external links (target=_blank / window.open) in the default browser
  webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url);
    return { action: 'deny' };
  });

  // Navigation allow-list. Only whitelisted hosts load inside the shell (with the
  // preload injected); everything else is pushed to the system browser.
  webContents.on('will-navigate', (event, url) => {
    // OAuth: Supabase authorize returns raw JSON errors in the webview — must open
    // in the system browser. Preserved explicitly (subset of the allow-list rule).
    if (url.includes('supabase.co/auth/v1/authorize')) {
      event.preventDefault();
      void openExternalSafely(url);
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
      void openExternalSafely(url);
    }
  });
}

function registerOpenExternalIpc() {
  ipcMain.handle('open-external', async (_event, url) => {
    await openExternalSafely(url);
  });
}

module.exports = {
  PROD_URL,
  DEV_URL,
  SUPABASE_URL,
  SUPPORT_WHATSAPP_URL,
  ALLOWED_NAV_HOSTS,
  openExternalSafely,
  attachShellNavigation,
  registerOpenExternalIpc,
};
