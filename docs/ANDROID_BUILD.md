# EzzyERP — Android native app (Capacitor)

Android only. The app wraps the same Vite/React build used on the web.

## Prerequisites (Windows)

1. **Node.js 18+** — `node -v`
2. **Android Studio** — https://developer.android.com/studio  
   - SDK Platform 34+  
   - Android SDK Build-Tools  
   - Android SDK Platform-Tools  
3. **Environment** (PowerShell, adjust if SDK path differs):

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools"
```

4. **`.env`** in project root with production values (used at build time):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

## One-time setup

```bash
cd smart-garment-entry
npm install
npm run build
npx cap add android
```

If `android/` already exists from the repo, skip `cap add android` and only run `npm run build:android`.

## Daily workflow

```bash
# 1. Build web assets and copy into android/
npm run build:android

# 2. Open in Android Studio
npm run android:open
```

In Android Studio: wait for Gradle sync → choose emulator or USB device → **Run**.

Or from CLI (device/emulator must be ready):

```bash
npm run android:run
```

## Live reload during development (optional)

Terminal 1:

```bash
npm run dev
```

Note your PC LAN IP (e.g. `192.168.1.5`). Temporarily edit `capacitor.config.ts`:

```ts
server: {
  url: "http://192.168.1.5:8080",
  cleartext: true,
},
```

Then:

```bash
npx cap sync android
npm run android:open
```

Remove `server.url` before release builds.

## Release APK / AAB (Play Store)

1. Android Studio → **Build → Generate Signed Bundle / APK**
2. Choose **Android App Bundle (AAB)** for Play Console
3. Create or use a release keystore (store safely; not in git)
4. Upload AAB to Google Play Console

## App ID

Default: `com.ezzyerp.app` in `capacitor.config.ts`. Change before first Play Store upload if needed, then:

```bash
npx cap sync android
```

## Permissions

Camera is enabled for barcode scanning (`html5-qrcode`). Internet is required for Supabase.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| White screen on launch | Run `npm run build:android` first; check Logcat in Android Studio |
| Gradle sync failed | Open SDK Manager; install API 34 + Build-Tools |
| Supabase auth errors | Rebuild with correct `.env`; no localhost URLs in production |
| `ANDROID_HOME` not set | Set env var to your SDK path (see above) |

## iOS

Not configured. This project targets **Android only**.
