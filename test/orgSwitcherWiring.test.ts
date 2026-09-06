import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("multi-company switcher wiring", () => {
  it("shows compact switcher in header only for multi-org users", async () => {
    const header = await readFile(path.join(ROOT, "src/components/Header.tsx"), "utf8");
    expect(header).toMatch(/organizations\.length > 1/);
    expect(header).toMatch(/CompactOrgSwitcher/);
    expect(header).toMatch(/erp-titlebar-meta hidden md:inline truncate max-w-\[240px\]/);
  });

  it("mounts OrganizationSelector on Organization Management general tab", async () => {
    const page = await readFile(path.join(ROOT, "src/pages/OrganizationManagement.tsx"), "utf8");
    expect(page).toMatch(/Switch to another company/);
    expect(page).toMatch(/<OrganizationSelector \/>/);
    expect(page).toMatch(/organizations\.length > 1/);
  });

  it("shares switch logic between selector components", async () => {
    const hook = await readFile(path.join(ROOT, "src/hooks/useOrganizationSwitcher.ts"), "utf8");
    expect(hook).toMatch(/switchOrganization\(org\.id\)/);
    expect(hook).toMatch(/navigate\(`\/\$\{org\.slug\}`\)/);

    const selector = await readFile(path.join(ROOT, "src/components/OrganizationSelector.tsx"), "utf8");
    const compact = await readFile(path.join(ROOT, "src/components/CompactOrgSwitcher.tsx"), "utf8");
    expect(selector).toMatch(/useOrganizationSwitcher/);
    expect(compact).toMatch(/useOrganizationSwitcher/);
  });
});

describe("create_organization safety (Step 1 verification)", () => {
  it("RPC only inserts a new organization_members row", async () => {
    const migration = await readFile(
      path.join(ROOT, "supabase/migrations/20260625120000_whatsapp_third_party_org_defaults.sql"),
      "utf8",
    );
    expect(migration).toMatch(
      /INSERT INTO public\.organization_members \(organization_id, user_id, role\)/,
    );
    expect(migration).not.toMatch(/DELETE FROM public\.organization_members/);
  });

  it("OrganizationSetup UI blocks self-service second org via existing membership check", async () => {
    const setup = await readFile(path.join(ROOT, "src/components/OrganizationSetup.tsx"), "utf8");
    expect(setup).toMatch(/existingOrgs\.length > 0/);
    expect(setup).toMatch(/You already have an organization/);
  });
});
