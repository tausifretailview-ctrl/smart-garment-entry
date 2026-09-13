import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const mig = readFileSync(
  join(
    root,
    "supabase/migrations/20260913173000_set_app_supabase_gucs_for_nightly_backup.sql",
  ),
  "utf8",
);

describe("nightly backup dispatch URL bootstrap", () => {
  it("redefines dispatch_nightly_backups with publishable URL/anon fallbacks", () => {
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.dispatch_nightly_backups()");
    expect(mig).toContain("current_setting('app.supabase_url', true)");
    expect(mig).toContain("https://lkbbrqcsbhqjvsxiorvp.supabase.co");
    expect(mig).toContain("eyJ");
    expect(mig).toMatch(/IF v_url IS NULL THEN/);
    expect(mig).toMatch(/IF v_anon IS NULL THEN/);
  });

  it("does not rely on ALTER DATABASE SET app.* (blocked on hosted Supabase)", () => {
    expect(mig).not.toMatch(/ALTER DATABASE postgres SET app\.supabase_url/);
    expect(mig).not.toMatch(/ALTER DATABASE postgres SET app\.supabase_anon_key/);
  });

  it("only bootstraps dispatch — no cron schedule churn", () => {
    expect(mig).not.toMatch(/purge_old_backup/);
    expect(mig).not.toMatch(/cron\.(schedule|unschedule)/);
  });
});
