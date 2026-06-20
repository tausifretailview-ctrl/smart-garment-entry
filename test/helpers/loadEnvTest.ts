import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Loads `.env.test` into process.env (does not override existing vars).
 * Called from vitest.setup.ts so integration tests see SUPABASE_TEST_* before module load.
 */
export function loadEnvTest(): void {
  const envPath = resolve(process.cwd(), ".env.test");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
