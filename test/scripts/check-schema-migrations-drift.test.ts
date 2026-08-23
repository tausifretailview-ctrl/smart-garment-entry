import { describe, expect, it } from "vitest";
import {
  assertLiveUrlAllowed,
  duplicateVersionGroups,
  listRepoMigrationFiles,
  resolveLiveCredentials,
  runSchemaMigrationsDriftCheck,
} from "../../scripts/check-schema-migrations-drift.mjs";
import { parseMigrationVersion } from "../../scripts/lib/schema-migration-versions.mjs";

describe("listRepoMigrationFiles", () => {
  it("parses every supabase/migrations/*.sql as a 14-digit version", async () => {
    const { versions, unparsed, files } = await listRepoMigrationFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(unparsed).toEqual([]);
    expect(versions.length).toBe(files.length);
    expect(versions.every((row) => parseMigrationVersion(row.file) === row.version)).toBe(true);
    expect(versions.some((row) => row.version === "20261001140000")).toBe(true);
    const dups = duplicateVersionGroups(versions);
    expect(dups.length).toBeGreaterThan(0);
    expect(dups.every((row) => row.files.length > 1)).toBe(true);
  });
});

describe("resolveLiveCredentials", () => {
  it("does not fall back to VITE_SUPABASE_URL", () => {
    const creds = resolveLiveCredentials({
      VITE_SUPABASE_URL: "https://lkbbrqcsbhqjvsxiorvp.supabase.co",
      SUPABASE_TEST_URL: "",
    });
    expect(creds.url).toBe("");
  });

  it("prefers explicit drift credentials over staging test credentials", () => {
    const creds = resolveLiveCredentials({
      SUPABASE_DRIFT_URL: "https://staging.example.supabase.co",
      SUPABASE_DRIFT_SERVICE_ROLE_KEY: "drift-key",
      SUPABASE_TEST_URL: "https://test.example.supabase.co",
      SUPABASE_TEST_SERVICE_ROLE_KEY: "test-key",
    });
    expect(creds.url).toBe("https://staging.example.supabase.co");
    expect(creds.key).toBe("drift-key");
  });
});

describe("assertLiveUrlAllowed", () => {
  it("refuses the production project ref without an explicit allow", () => {
    expect(() =>
      assertLiveUrlAllowed("https://lkbbrqcsbhqjvsxiorvp.supabase.co", false),
    ).toThrow(/--allow-production/);
  });

  it("allows production when opted in", () => {
    expect(() =>
      assertLiveUrlAllowed("https://lkbbrqcsbhqjvsxiorvp.supabase.co", true),
    ).not.toThrow();
  });
});

describe("runSchemaMigrationsDriftCheck live compare", () => {
  it("fails when a critical repo migration is missing live", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const code = await runSchemaMigrationsDriftCheck({
      argv: ["--check"],
      envMap: {
        SUPABASE_DRIFT_URL: "https://staging.example.supabase.co",
        SUPABASE_DRIFT_SERVICE_ROLE_KEY: "test-key",
      },
      fetchLive: async () => ["20260101000000"],
      log: (msg) => logs.push(String(msg)),
      error: (msg) => errors.push(String(msg)),
    });
    expect(code).toBe(1);
    expect(errors.some((line) => /Schema-migration drift detected/.test(line))).toBe(true);
  });

  it("skips live compare without credentials unless --require-live", async () => {
    const logs: string[] = [];
    const code = await runSchemaMigrationsDriftCheck({
      argv: ["--check"],
      envMap: {},
      log: (msg) => logs.push(String(msg)),
      error: () => {},
    });
    expect(code).toBe(0);
    expect(logs.some((line) => /Live compare skipped/.test(line))).toBe(true);
  });
});
