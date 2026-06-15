import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "android/app/build/outputs/apk/debug/app-debug.apk");
const dest = path.join(root, "public/downloads/EzzyERP-1.1.0.apk");

if (!fs.existsSync(src)) {
  console.error("APK not found. Run: npm run build:apk:debug");
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
