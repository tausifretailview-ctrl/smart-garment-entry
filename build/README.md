# Desktop build resources

Place the EzzyERP logo here so the Windows installer and app window use it.

## Required

- `build/icon.png` — square logo, ideally **512x512** (PNG).

`electron-builder` automatically converts `build/icon.png` into the Windows
`.ico` used by the installer, the `.exe`, the taskbar, and the system tray.

## If the build complains about the icon

Some `electron-builder` setups require an actual `.ico`. Generate one from the
PNG with the fallback script:

```bash
npm install --save-dev png-to-ico
node scripts/make-icons.mjs
```

This produces `build/icon.ico` from `build/icon.png`.
