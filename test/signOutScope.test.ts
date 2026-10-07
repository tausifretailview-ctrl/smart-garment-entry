import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// supabase.auth.signOut() defaults to scope "global", which revokes the refresh
// token on every device signed in with that account. Shops share one login across
// counter PCs, so one bare signOut() logs every other till out mid-bill.
// Only a password change may revoke other devices on purpose.
const GLOBAL_SIGN_OUT_ALLOWED = new Set(["src/pages/ResetPassword.tsx"]);

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listSourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

describe("sign-out scope", () => {
  it("never revokes other devices' sessions outside a password change", async () => {
    const offenders: string[] = [];
    for (const file of await listSourceFiles(path.join(ROOT, "src"))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (GLOBAL_SIGN_OUT_ALLOWED.has(rel)) continue;
      const src = await readFile(file, "utf8");
      if (/auth\.signOut\(\s*\)/.test(src) || /scope:\s*["']global["']/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
