# EzzyERP — Android native app (Capacitor)

Android only. The app wraps the same Vite/React build used on the web and PWA.

## Prerequisites (Windows)

1. **Node.js 18+** — `node -v`
2. **Java JDK 21** — `java -version` (required for Capacitor 7 / Gradle; JDK 17 alone is not enough)
3. **Android Studio** — https://developer.android.com/studio  
   - SDK Platform 34+  
   - Android SDK Build-Tools  
   - Android SDK Platform-Tools  
4. **Environment** (PowerShell, adjust if SDK path differs):

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools"
```

5. **`.env`** in project root with production values (used at build time):

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

### Launcher icons

PWA icons (`public/icon-192.png`, etc.) may be missing in some clones. After `cap add android`, use Android Studio **File → New → Image Asset** to set the app launcher icon on `android/app/src/main/res/mipmap-*`.

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

## Sideload debug APK (share with users)

One command (build web + sync + assemble debug APK):

```bash
npm run build:apk:debug
```

**Output file:**

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy `app-debug.apk` to phones. Users must allow **Install unknown apps** for the file manager or browser used to open the APK.

Release APK (unsigned, for testing only):

```bash
npm run build:apk:release
```

Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk` (sign before distribution).

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

Remove `server.url` before release/APK builds.

## Native features (Capacitor)

| Feature | Package |
|---------|---------|
| Splash screen | `@capacitor/splash-screen` |
| Status bar (ERP blue `#1e40af`) | `@capacitor/status-bar` |
| Keyboard resize | `@capacitor/keyboard` |
| Hardware back | `@capacitor/app` |
| Offline detection | `@capacitor/network` |

`PwaInstallBanner` is hidden in the native WebView. Offline UI uses `OfflineIndicator` + network plugin on native.

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
| Gradle sync failed | Open SDK Manager; install API 34 + Build-Tools; confirm JDK 17 |
| `gradlew` not found | Run `npx cap add android` once to generate `android/` |
| Supabase auth errors | Rebuild with correct `.env`; no localhost URLs in production |
| `ANDROID_HOME` not set | Set env var to your SDK path (see above) |
| PWA install banner on APK | Should not appear; rebuild if `Capacitor.isNativePlatform()` is false in WebView |

## iOS

Not configured. This project targets **Android only**.
