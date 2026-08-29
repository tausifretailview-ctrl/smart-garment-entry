import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260829070000_daily_backup_all_orgs_3day_retention.sql",
  ),
  "utf8",
);

describe("daily backup 3-day retention migration", () => {
  it("backs up every org at a 3-day floor and does not grant cron to anon", () => {
    expect(sql).toContain("backup_retention_days = 3");
    expect(sql).toContain("auto_backup_enabled = true");
    expect(sql).toContain("GREATEST(COALESCE(NULLIF(p_days, 0), 3), 3)");
    expect(sql).toContain("body := jsonb_build_object('ticket', v_ticket)");
    expect(sql).toContain("daily-scheduled-backup-retry");
    expect(sql).toContain("daily-scheduled-backup-morning");
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.dispatch_nightly_backups() FROM PUBLIC, anon, authenticated",
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.dispatch_nightly_backups\(\) TO anon/,
    );
    expect(sql).toMatch(/IF auth\.role\(\) = 'anon'/);
  });
});
