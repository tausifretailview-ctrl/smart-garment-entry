import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readMigration(name: string) {
  return readFile(path.join(ROOT, "supabase/migrations", name), "utf8");
}

describe("create_organization seed inventory", () => {
  it("latest create_organization PERFORMs seed_organization_whatsapp_settings after membership insert", async () => {
    const sql = await readMigration("20260625120000_whatsapp_third_party_org_defaults.sql");
    const fnStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_user_id uuid DEFAULT auth.uid())",
    );
    const fnEnd = sql.indexOf("-- Platform admin org creation", fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    const fn = sql.slice(fnStart, fnEnd);

    expect(fn).toMatch(/INSERT INTO barcode_sequence/);
    expect(fn).toMatch(/INSERT INTO public\.organization_members/);
    expect(fn).toMatch(/INSERT INTO public\.user_roles/);
    expect(fn).toMatch(/PERFORM public\.seed_organization_whatsapp_settings\(v_org\.id\)/);
    expect(fn).not.toMatch(/CREATE TRIGGER/);
  });

  it("latest platform_create_organization also PERFORMs the same WhatsApp seed", async () => {
    const sql = await readMigration("20260625120000_whatsapp_third_party_org_defaults.sql");
    expect(sql).toMatch(/PERFORM public\.seed_organization_whatsapp_settings\(v_org_id\)/);
  });

  it("organizations AFTER INSERT trigger seeds expense categories (not WhatsApp)", async () => {
    const sql = await readMigration("20260115084746_486b215a-621d-4e6c-ab0b-61abe1274848.sql");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION create_default_expense_categories\(\)/);
    expect(sql).toMatch(/AFTER INSERT ON organizations/);
    expect(sql).toMatch(/EXECUTE FUNCTION create_default_expense_categories\(\)/);
    expect(sql).not.toMatch(/seed_organization_whatsapp_settings/);
  });

  it("frontend create-additional-org path only calls create_organization", async () => {
    const helper = await readFile(path.join(ROOT, "src/utils/createAdditionalOrganization.ts"), "utf8");
    expect(helper).toMatch(/fn: "create_organization"/);
    expect(helper).not.toMatch(/seed_organization_whatsapp_settings/);
    expect(helper).not.toMatch(/platform_create_organization/);
  });
});

describe("20261221120000 seed_organization_whatsapp_settings restore", () => {
  it("defines the missing function without rewriting create_organization or platform_create_organization", async () => {
    const sql = await readMigration("20261221120000_seed_organization_whatsapp_settings.sql");

    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.seed_organization_whatsapp_settings\(p_organization_id uuid\)/,
    );
    expect(sql).toMatch(/INSERT INTO public\.whatsapp_api_settings/);
    expect(sql).toMatch(/INSERT INTO public\.settings \(organization_id\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.seed_organization_whatsapp_settings\(uuid\) FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.seed_organization_whatsapp_settings\(uuid\) TO authenticated, service_role/);

    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_organization/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.platform_create_organization/);
    expect(sql).not.toMatch(/UPDATE public\.whatsapp_api_settings/);
    expect(sql).not.toMatch(/UPDATE public\.platform_settings/);
    expect(sql).not.toMatch(/DD4EXjn0QrvoLDQLsN5jKNqwB5CfyVU5ERVJTQO9SRQiNmG5hWWnb3REFTSAREFTSADf1Aie2LCleiHxlBahUhRWrhi0oicRWONqdiQHfDbHb9mx8SNJfAsPyxwaiddNr3NOIOFvEUAD4Dw36A/);
  });

  it("is listed as a critical live-apply migration", async () => {
    const versions = await readFile(
      path.join(ROOT, "scripts/lib/schema-migration-versions.mjs"),
      "utf8",
    );
    expect(versions).toMatch(/version: "20261221120000"/);
    expect(versions).toMatch(/seed_organization_whatsapp_settings/);
  });
});
