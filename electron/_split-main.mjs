/**
 * One-shot Item-4 splitter. Run: node electron/_split-main.mjs
 * Deletes itself after success.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(__dirname, 'main.cjs');
const src = fs.readFileSync(mainPath, 'utf8');

function extractTemplate(constName) {
  const needle = `  const ${constName} = \``;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`missing ${constName}`);
  const contentStart = start + needle.length;
  let i = contentStart;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '`' && src.slice(i, i + 2) === '`;') {
      return src.slice(contentStart, i);
    }
    i += 1;
  }
  throw new Error(`unterminated ${constName}`);
}

const HEADER_CSS = extractTemplate('HEADER_CSS');
const HINT_BAR_JS_RAW = extractTemplate('HINT_BAR_JS');
const hintWithPlaceholder = HINT_BAR_JS_RAW.replace(
  '${JSON.stringify(app.getVersion())}',
  '__EZZY_APP_VERSION__',
);
if (!hintWithPlaceholder.includes('__EZZY_APP_VERSION__')) {
  throw new Error('failed to placeholder app version in HINT_BAR_JS');
}

// ── security.cjs ──────────────────────────────────────────────────
fs.writeFileSync(
  path.join(__dirname, 'security.cjs'),
  `const { shell, ipcMain } = require('electron');

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
  if (typeof url !== 'string' || !/^https?:\\/\\//i.test(url)) {
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
`,
);
console.log('wrote security.cjs');

// ── shell-ui.cjs ──────────────────────────────────────────────────
fs.writeFileSync(
  path.join(__dirname, 'shell-ui.cjs'),
  `/**
 * Electron-injected CSS / hint-bar JS. Splash lives in ./splash.cjs.
 */

const HEADER_CSS = ${JSON.stringify(HEADER_CSS)};

/**
 * @param {string} appVersion
 * @returns {string}
 */
function buildHintBarJs(appVersion) {
  // Original HINT_BAR_JS interpolated app.getVersion() via JSON.stringify.
  const versionLiteral = JSON.stringify(appVersion);
  return ${JSON.stringify(hintWithPlaceholder)}.replace(
    '__EZZY_APP_VERSION__',
    versionLiteral,
  );
}

module.exports = {
  HEADER_CSS,
  buildHintBarJs,
};
`,
);
console.log('wrote shell-ui.cjs');

// Verify round-trip
const { buildHintBarJs } = await import('./shell-ui.cjs');
const sample = buildHintBarJs('1.2.0');
if (!sample.includes('var APP_VERSION = "1.2.0"')) {
  console.error('HINT_BAR version inject failed:\\n', sample.slice(0, 300));
  process.exit(1);
}
console.log('hint bar version inject OK');

console.log('Part 1 done — remaining modules written by agent.');
`
