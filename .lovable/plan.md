# Liberty PWA: why the installed app shows the generic icon and opens the wrong page

Investigation only — no code or data changed.

## What the video shows
The Windows desktop/taskbar shortcut is labelled "EzzyERP - Easy Billing, Smart Business" with a plain browser (Edge "e") icon — not the EzzyERP logo and not Liberty's shop name. That is exactly what Windows shows when the install could not use the app's icons and captured the generic site manifest.

## Cause 1 — the 512 icon is not a real PNG
`public/icon-512.png` is a JPEG file that has been given a `.png` name. The server sends it as `image/png` and the manifest declares `"type": "image/png"`, so Chrome/Edge reject it as a malformed icon. The 512 icon is the one Windows uses for the desktop shortcut and taskbar, so the install falls back to the browser's own icon.

- `public/icon-192.png` — real PNG, 192x192 (fine)
- `public/icon-512.png` — JPEG data, 512x512 (broken for PWA install)
- Same broken file is live at the production domain.

## Cause 2 — the shop-specific manifest is a `blob:` URL
`src/lib/orgPwaManifest.ts` builds Liberty's manifest in memory and attaches it as a `blob:` link. Desktop Chrome/Edge on Windows do not install from a `blob:` manifest; they use the static `/manifest.webmanifest`, which says:

- name: "EzzyERP - Easy Billing, Smart Business" (no shop name)
- start_url: `/organization-setup`

So the installed Liberty app opens the generic organization-entry screen instead of Liberty's login page, and it is titled EzzyERP.

## Cause 3 — install timing
`applyOrgPwaManifest` only runs after `OrgLayout` mounts. If the user installs from the browser menu before/outside that, the static manifest is what gets captured — the same generic result.

## Recommended fix (separate task, not done here)
1. Replace `public/icon-512.png` with a genuine 512x512 PNG (and add a 1024 maskable variant); verify with `file` before shipping.
2. Serve real per-shop manifests from a same-origin URL (e.g. `/manifest/liberty.webmanifest` via a rewrite or a small function) instead of `blob:`, with `name` = shop name and `start_url` = `/liberty`.
3. After the fix, existing installs must be uninstalled and reinstalled once — Windows caches the shortcut icon.

## Note
Both custom domains respond 200, and the manifest itself loads, so this is not a hosting or DNS problem.
