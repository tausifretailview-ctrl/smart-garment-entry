/**
 * Field Sales Android app (product flavor "fieldsales"): after `npx cap sync android`, write its
 * own capacitor.config.json next to the owner one, opening the salesman app instead of the owner
 * dashboard, with the Field Sales orange splash / status bar.
 *
 *   npm run build:android                                  → any shop (salesman picks the shop, then signs in)
 *   CAPACITOR_ORG_SLUG=ella-noor npm run build:android     → opens that shop's Field Sales login
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "android/app/src/main/assets/capacitor.config.json");
const dest = path.join(root, "android/app/src/fieldsales/assets/capacitor.config.json");
const FIELD_SALES_ORANGE = "#F97316";

export function fieldSalesStartUrl(ownerUrl, slugRaw = "") {
  const origin = new URL(ownerUrl).origin;
  const slug = String(slugRaw).trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return slug ? `${origin}/${slug}/field-sales?app=fieldsales` : `${origin}/?app=fieldsales`;
}

export function fieldSalesCapacitorConfig(ownerConfig, slugRaw = "") {
  const cfg = structuredClone(ownerConfig);
  cfg.appId = `${cfg.appId}.fieldsales`;
  cfg.appName = "Field Sales";
  cfg.server = { ...(cfg.server ?? {}), url: fieldSalesStartUrl(cfg.server?.url ?? "https://app.inventoryshop.in", slugRaw) };
  cfg.plugins = {
    ...(cfg.plugins ?? {}),
    SplashScreen: { ...(cfg.plugins?.SplashScreen ?? {}), backgroundColor: FIELD_SALES_ORANGE },
    StatusBar: { ...(cfg.plugins?.StatusBar ?? {}), backgroundColor: FIELD_SALES_ORANGE },
  };
  return cfg;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(src)) {
    console.error("android/app/src/main/assets/capacitor.config.json not found. Run: npx cap sync android");
    process.exit(1);
  }
  const owner = JSON.parse(fs.readFileSync(src, "utf8"));
  const cfg = fieldSalesCapacitorConfig(owner, process.env.CAPACITOR_ORG_SLUG ?? process.env.VITE_BUNDLED_ORG_SLUG ?? "");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(cfg, null, "\t")}\n`);
  console.log(`Field Sales app config → ${path.relative(root, dest)} (opens ${cfg.server.url})`);
}
