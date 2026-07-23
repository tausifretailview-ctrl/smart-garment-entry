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

Remove `server.url` before **local live-reload** dev only. Keep `server.url` for production remote-shell APKs.

## Native features (Capacitor)

| Feature | Package |
|---------|---------|
| Splash screen | `@capacitor/splash-screen` |
| Status bar (ERP blue `#1e40af`) | `@capacitor/status-bar` |
| Keyboard resize | `@capacitor/keyboard` |
| Hardware back | `@capacitor/app` |
| Offline detection | `@capacitor/network` |

`PwaInstallBanner` is hidden in the native WebView. Offline UI uses `OfflineIndicator` + network plugin on native.

## Release APK / AAB (Play Store or direct install)

The Android shell loads **https://app.inventoryshop.in** at runtime (same as desktop Electron). Web updates deploy via Vercel — no APK reinstall for code changes. Bump `versionCode` / `versionName` in `android/app/build.gradle` only when releasing a new native build.

### Signing (one-time)

1. Generate keystore **outside the repo** (save passwords securely):

```powershell
mkdir $env:USERPROFILE\keys -ErrorAction SilentlyContinue
cd $env:USERPROFILE\keys
keytool -genkey -v -keystore ezzyerp-release.keystore -alias ezzyerp -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy `android/keystore.properties.example` → `android/keystore.properties` and set absolute `storeFile` path + passwords (file is gitignored).

### Build signed APK

```powershell
npm run build:android
cd android
.\gradlew.bat assembleRelease
```

**Output:** `android/app/build/outputs/apk/release/app-release.apk`

Copy/rename to `public/downloads/EzzyERP-1.1.0.apk` and deploy to Vercel so org install pages can link it (e.g. `https://app.inventoryshop.in/ella-noor/install`).

Play Store AAB: `.\gradlew.bat bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`

Or use Android Studio → **Build → Generate Signed Bundle / APK**.

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
| White screen on launch | APK uses remote shell (`server.url` → `https://app.inventoryshop.in`). Native splash must stay until the remote page loads (`launchAutoHide: false` in `capacitor.config.ts`). Rebuild APK with `npm run build:android` after changing Capacitor config — a Vercel web deploy alone does **not** update splash settings. Also check phone internet + Logcat. |
| Gradle sync failed | Open SDK Manager; install API 34 + Build-Tools; confirm JDK 17 |
| `gradlew` not found | Run `npx cap add android` once to generate `android/` |
| Supabase auth errors | Rebuild with correct `.env`; no localhost URLs in production |
| `ANDROID_HOME` not set | Set env var to your SDK path (see above) |
| PWA install banner on APK | Should not appear; rebuild if `Capacitor.isNativePlatform()` is false in WebView |

## iOS

Not configured. This project targets **Android only**.
