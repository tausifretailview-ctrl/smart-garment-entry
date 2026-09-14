import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scheduledBackup = readFileSync(
  join(root, "supabase/functions/scheduled-backup/index.ts"),
  "utf8",
);
const gucMig = readFileSync(
  join(
    root,
    "supabase/migrations/20260913173000_set_app_supabase_gucs_for_nightly_backup.sql",
  ),
  "utf8",
);

describe("scheduled-backup stagger + retry guard", () => {
  it("no longer fans out every org concurrently via Promise.all", () => {
    expect(scheduledBackup).not.toMatch(/await Promise\.all\s*\(/);
    expect(scheduledBackup).toContain("sortOrgsForStaggeredDispatch");
    expect(scheduledBackup).toContain("resolveRetryAfterMs");
    expect(scheduledBackup).toContain("NIGHTLY_DISPATCH_STAGGER_WINDOW_MS");
  });

  it("persists hard dispatch failures instead of only logging them", () => {
    expect(scheduledBackup).toContain(".from('backup_logs')");
    expect(scheduledBackup).toContain("status: 'failed'");
    expect(scheduledBackup).toContain("scheduled_backup_dispatch");
  });

  it("treats HTTP 546 as failure (WORKER_RESOURCE_LIMIT), not success", () => {
    expect(scheduledBackup).toContain("isWorkerResourceLimitStatus");
    expect(scheduledBackup).toContain("isSuccessfulDispatchStatus");
  });

  it("keeps the earlier GUC/fallback dispatch_nightly_backups fix intact", () => {
    expect(gucMig).toContain(
      "CREATE OR REPLACE FUNCTION public.dispatch_nightly_backups()",
    );
    expect(gucMig).toMatch(/IF v_url IS NULL THEN/);
    expect(gucMig).toMatch(/IF v_anon IS NULL THEN/);
    expect(gucMig).toContain("https://lkbbrqcsbhqjvsxiorvp.supabase.co");
  });
});
