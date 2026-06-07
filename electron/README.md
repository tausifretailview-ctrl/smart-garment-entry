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
`build.publish`). To ship an update:

```bash
npm version patch          # bumps package.json version
npm run electron:publish   # builds + uploads to GitHub Releases
```

Installed clients check on launch, download in the background, and prompt to
restart when ready.

## Performance switches (already enabled in `main.cjs`)

| Switch | Why |
| --- | --- |
| `disable-renderer-backgrounding` | Timers / queries keep running when minimized to tray, so reopening feels instant. |
| `disable-background-timer-throttling` | Same reason — Chromium otherwise throttles `setTimeout` in hidden windows. |
| `disable-backgrounding-occluded-windows` | Prevents demotion when covered by another app. |
| `disk-cache-size=512MB` | Keeps JS chunks / images across launches — cold reload re-downloads less. |
| `preconnect` to website + Supabase on app ready | Warms TLS sockets, saves ~200–400 ms on first request. |
| `backgroundThrottling: false` (BrowserWindow) | Per-window backup for the global switches above. |
| `zoomFactor: 0.8` (via `webPreferences` only) | Applied before first paint — no post-load reflow. |
| First-retry delay 400 ms | Recovers instantly from a brief network flap; later retries back off. |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank window on launch | Internet down? App will auto-retry up to 4 times. Press **F5**, use **File → Refresh App**, or right-click → **Refresh App**. |
| Stale data / screen stuck | **F5** or **Ctrl+R** reloads the app. Tray icon → **Refresh App** also works. Unsaved work on the current screen may be lost. |
| "Not responding" dialog | Click **Reload now** — work on the current screen may be lost. |
| App stays in background after Close | That's intentional. Right-click tray icon → **Quit** to fully exit. |
| Printing dialog still appears | The web app calls `electronAPI.silentPrint()` only when running inside the desktop shell. Verify `window.electronAPI?.isElectron === true` in DevTools. |
| Auto-update never prompts | Only works in the installed `.exe` (not `electron:dev`). Confirm `app-update.yml` is present next to the executable. |