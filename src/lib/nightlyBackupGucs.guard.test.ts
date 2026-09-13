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

describe("nightly backup app.* GUCs bootstrap", () => {
  it("sets database-level app.supabase_url and app.supabase_anon_key", () => {
    expect(mig).toMatch(/ALTER DATABASE postgres SET app\.supabase_url\s*=/);
    expect(mig).toMatch(/ALTER DATABASE postgres SET app\.supabase_anon_key\s*=/);
    expect(mig).toContain("https://");
    expect(mig).toContain("eyJ");
  });

  it("only bootstraps GUCs — no cron schedule churn", () => {
    expect(mig).not.toMatch(/purge_old_backup/);
    expect(mig).not.toMatch(/cron\.(schedule|unschedule)/);
    expect(mig).not.toMatch(/CREATE OR REPLACE FUNCTION public\.dispatch_nightly_backups/);
  });
});
