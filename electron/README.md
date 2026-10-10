# EzzyERP Desktop (Electron / Windows)

The desktop app is a thin Electron shell that loads the live web app
(`https://app.inventoryshop.in`). It is not a separate codebase — every
web-app change ships to the desktop app automatically on next launch.

## Run from source (for QA on Windows)

```bash
npm install
npm run electron:dev
```

This starts Vite on `http://localhost:8080` and opens Electron pointed at it
(DevTools auto-open). Edits hot-reload as usual.

## Build the Windows installer (.exe)

Must be run on a real Windows machine (the Lovable sandbox cannot produce
`.exe` — 7-zip dynamic-link issue with `electron-builder` in Linux containers).

```bash
npm install
npm run build              # vite build → dist/
npm run electron:build:win # electron-builder → release/EzzyERP Setup x.y.z.exe
```

Node 18 LTS or newer is required.

## Auto-update

Wired via `electron-updater` to GitHub Releases (see `package.json` →
`build.publish`, `releaseType: release` so the release is live, not a draft).
Only the installed **Setup** build updates itself; the portable `.exe` never does.

Installed clients check on launch and every 4 hours, download in the
background, and install when EzzyERP is next quit. No modal dialog appears
while billing (a scanner's Enter would press it): a Windows notification and a
tray item **Restart to install update…** offer an early restart.

## Release checklist (each new desktop version)

1. Bump `version` in `package.json` (and the root entry in `package-lock.json`).
2. On the Windows PC: `npm install`, then `$env:GH_TOKEN="<token with repo scope>"; npm run electron:publish`.
   This builds `release/EzzyERP-Setup-x.y.z.exe`, `EzzyERP-Portable-x.y.z.exe`,
   `latest.yml` and the `.blockmap`, and publishes them as a GitHub Release
   (that is what installed apps update from).
3. Upload both `.exe` files to the private Supabase storage bucket `app-downloads`
   (that is what the install page serves to new shops).
4. Bump `CURRENT_VERSION` (and keep old names in `ALLOWED_FILES`) in
   `supabase/functions/download-windows/index.ts`, redeploy `download-windows`,
   then bump `APP_VERSION` in `src/config/downloads.ts`.
5. Install page → Download → install on a test PC, open the DEMO shop, and run
   Settings → Desktop Print Settings → Test Print Invoice / Receipt / Label.

## Web app updates vs desktop installer

The `.exe` only wraps a browser pointed at **https://app.inventoryshop.in**.
Account page and all ERP features come from that live URL — **not** from files
inside the installer.

| What changed | What to do |
| --- | --- |
| Web UI (Accounts, reports, etc.) | **Ctrl+R** or **File → Refresh App** (clears cache + reloads from server). Help → Check for Updates checks the **installer** only. F5 is reserved for POS Sale Return. |
| Desktop shell (printing, menus, tray) | Help → Check for Updates, or reinstall from GitHub Releases. |

If Accounts looks old after a deploy: press **Ctrl+R**, use the header **↻** button,
or wait for the **“New version on server”** banner and click **Reload now**.

Stale data can also come from the React Query offline cache — a hard refresh
(Ctrl+R) clears it. The web build ID changes on every `vite build` so persisted
cache is discarded after reload.

## Performance switches (already enabled in `main.cjs`)

| Switch | Why |
| --- | --- |
| `disable-renderer-backgrounding` | Timers / queries keep running when minimized to tray, so reopening feels instant. |
| `disable-background-timer-throttling` | Same reason — Chromium otherwise throttles `setTimeout` in hidden windows. |
| `disable-backgrounding-occluded-windows` | Prevents demotion when covered by another app. |
| `disk-cache-size=512MB` | Keeps JS chunks / images across launches — cold reload re-downloads less. |
| `preconnect` to website + Supabase on app ready | Warms TLS sockets, saves ~200–400 ms on first request. |
| `backgroundThrottling: false` (BrowserWindow) | Per-window backup for the global switches above. |
| `zoomFactor: 1.0` (via `webPreferences` only) | Full-width layout; density via in-app Display Scale (Standard default on desktop). |
| First-retry delay 400 ms | Recovers instantly from a brief network flap; later retries back off. |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank window on launch | Internet down? App auto-retries up to 4 times. Press **Ctrl+R**, use **File → Refresh App**, or right-click → **Refresh App**. |
| Blank window after minimize / tab switch | Renderer may have crashed (memory). A **Reload app** dialog should appear; if not, press **Ctrl+R**. Close unused ERP tabs to reduce memory use. |
| Stale data / screen stuck | **Ctrl+R** reloads the app (cache is cleared). Tray icon → **Refresh App** also works. If a web deploy landed, an **Update available** banner may appear — click **Reload now**. |
| Web changes missing but desktop is current | The `.exe` only wraps the browser — UI changes ship to `app.inventoryshop.in`. Press **Ctrl+R** after deploy; no new installer needed unless `electron/` or `package.json` version changed. |
| POS / dashboard shows half width or clipped footer on launch | Update to the latest desktop build (100% zoom + auto viewport sync). Use header **Display Scale** (monitor icon) → **Standard** if text is too large. Press **Ctrl+R** once after login if layout still looks wrong. |
| "Not responding" dialog | Click **Reload now** — work on the current screen may be lost. |
| App stays in background after Close | That's intentional. Right-click tray icon → **Quit** to fully exit. |
| Printing dialog still appears | The web app calls `electronAPI.silentPrint()` only when running inside the desktop shell. Verify `window.electronAPI?.isElectron === true` in DevTools. |
| Auto-update never arrives | Only works in the installed **Setup** `.exe` (not portable, not `electron:dev`). Confirm `app-update.yml` is in the install folder's `resources`, and that the GitHub Release for the new version is published (not a draft) with `latest.yml` attached. |
| Direct print goes to the dialog instead | The pinned printer is not connected or was renamed. The toast names it; re-pick it in Settings → Desktop Print Settings (a "not connected" note shows there). |