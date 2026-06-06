## Batch 1 — Make Electron app feel like Tally / Vyapar (Steps 1, 4, 6, 7)

Electron-only changes. Web app, business logic, search, prints, RLS, dashboards — untouched. Browser/PWA users see zero difference.

### Step 1 — Native Windows menu bar
Edit `electron/main.cjs` only.
- Set `autoHideMenuBar: false` so the menu is always visible (classic Windows feel).
- Expand the current `createMenu()` into the standard ERP structure. Every item just calls the existing `sendNavigateShortcut(path)` — no new routes:
  - **File** — New Sale (Alt+N), New Purchase (Alt+B), Print (Ctrl+P → forwards to web print), Backup → /settings/backup, Exit
  - **Edit** — Cut / Copy / Paste / Select All (Electron `role` defaults)
  - **Masters** — Customers, Suppliers, Products, Categories
  - **Transactions** — POS Sale (Alt+P), Sale Invoice (Alt+N), Purchase (Alt+B), Sale Return, Purchase Return, Receipt, Payment
  - **Reports** — Day Book, Stock (Alt+S), GSTR-1, GSTR-3B, Outstanding, P&L
  - **Utilities** — Stock Settlement, Recycle Bin, User Rights, WhatsApp Inbox
  - **Window** — Zoom In/Out/Reset, Full Screen (F12), Reload
  - **Help** — Keyboard Shortcuts (opens injected overlay), About, WhatsApp Support, Check for Updates
- F1–F11 POS keys stay untouched (no menu accelerator collides with them).

### Step 4 — "Desktop software" CSS sheet (Electron-only)
Inject one stylesheet via `webContents.insertCSS` on `did-finish-load`, scoped under `html.desktop-shell` (class added by preload). Browsers ignore it.
- Border-radius `0.5rem` → `0.25rem` on cards, dialogs, inputs, buttons.
- `shadow-md` / `shadow-lg` → `shadow-sm` (flatter Windows feel).
- Remove gradient backgrounds, use flat navy.
- Thin gray scrollbars (Windows 11 style) via `::-webkit-scrollbar` width 10px.
- Sidebar gets a 1px right border instead of soft shadow.
- Number/text inputs get a 1px solid `#94a3b8` border + white background (Vyapar look).
- Buttons keep current colors but lose hover-scale.
- The existing in-page sticky footers / `[data-entry-form]` rules from the current header CSS injection stay exactly as they are — no z-index conflict.

### Step 6 — Branded splash before first paint
- New file `electron/splash.html` — frameless 320×220 navy panel with white "EzzyERP" wordmark, "Smart Inventory & Billing" subtitle, indeterminate progress bar, and `v{version}`.
- New file `electron/splash.cjs` — tiny helper that creates the splash `BrowserWindow` during `app.whenReady`, then destroys it when `mainWindow` fires `ready-to-show`.
- Wired from `main.cjs` only; no other file changes.
- Eliminates the 1–2 s blank navy window on cold start.

### Step 7 — Native right-click context menu
- Listen on `webContents.on('context-menu', (e, params) => …)` in `main.cjs`.
- Build a Menu with Cut / Copy / Paste / Select All (standard `role`s), separator, "Copy Link" when `params.linkURL`, "Save Image As" when `params.hasImageContents`, separator, "Print" (forwards to existing silent-print pipeline), "Inspect Element" only when `!app.isPackaged`.
- No web-side change — works on every input/table/cell automatically.

## Files touched
- `electron/main.cjs` — menu expansion, autoHideMenuBar false, context-menu handler, splash wiring, insertCSS payload extended.
- `electron/preload.cjs` — add `document.documentElement.classList.add('desktop-shell')` on `DOMContentLoaded`.
- `electron/splash.html` (new)
- `electron/splash.cjs` (new)

## Explicitly NOT changing
- Any React component, page, route, context.
- `index.css`, `tailwind.config.ts`, design tokens.
- Print templates, search, RLS, edge functions, migrations, `client.ts`, `types.ts`.
- Existing F1–F11 / Alt-key shortcut handlers.
- The web preview / PWA — desktop-shell CSS is gated by a class that only the Electron preload adds.

## Verify
- `npm run electron:dev` on Windows → menu bar visible at top, splash on launch, right-click works everywhere, cards look flatter and more "Windows-native".
- Open browser preview → identical to before (no `desktop-shell` class → no CSS overrides applied).
- Spot-check 5 screens: POS Sale, Sales Invoice, Purchase Entry, Stock Report, Dashboard — no layout regressions, sticky footers still pinned, F-keys still work.

Approve and I'll implement Batch 1 in one go.