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

  it("clears React Query on org switch so tenant data cannot bleed", async () => {
    const ctx = await readFile(path.join(ROOT, "src/contexts/OrganizationContext.tsx"), "utf8");
    expect(ctx).toMatch(/queryClient\.clear\(\)/);
    expect(ctx).toMatch(/currentOrganization\?\.id !== orgId/);
  });

  it("OrgLayout does not auto-redirect into another org on a foreign slug", async () => {
    const layout = await readFile(path.join(ROOT, "src/components/OrgLayout.tsx"), "utf8");
    expect(layout).toMatch(/never allow fallback redirect to another organization/);
    expect(layout).toMatch(/Access denied for this organization URL/);
    expect(layout).not.toMatch(/navigate\(`\/\$\{organizations\[0\]/);
  });
});

describe("create_organization safety (self-serve additional org)", () => {
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

  it("RPC inserts the caller as admin on a new free-tier org and does not cap memberships", async () => {
    const migration = await readFile(
      path.join(ROOT, "supabase/migrations/20260625120000_whatsapp_third_party_org_defaults.sql"),
      "utf8",
    );
    const fnStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_user_id uuid DEFAULT auth.uid())",
    );
    const fnEnd = migration.indexOf("-- Platform admin org creation", fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fn = migration.slice(fnStart, fnEnd);

    expect(fn).toMatch(/VALUES \(p_name, v_slug, 'free'/);
    expect(fn).toMatch(/VALUES \(v_org\.id, p_user_id, 'admin'\)/);
    expect(fn).not.toMatch(/already have an organization/i);
    expect(fn).not.toMatch(/COUNT\(\*\)\s+FROM\s+public\.organization_members/);
    expect(fn).not.toMatch(/FROM public\.organization_members[\s\S]*RAISE EXCEPTION/);
  });

  it("OrganizationSetup first-org form still redirects existing members (new-user path unchanged)", async () => {
    const setup = await readFile(path.join(ROOT, "src/components/OrganizationSetup.tsx"), "utf8");
    expect(setup).toMatch(/existingOrgs\.length > 0/);
    expect(setup).toMatch(/You already have an organization/);
    expect(setup).toMatch(/organizations\.length === 1/);
    expect(setup).toMatch(/Create Your Organization/);
    expect(setup).toMatch(/createAdditionalOrganization/);
  });

  it("Organization Management lets an existing admin create an additional organization", async () => {
    const page = await readFile(path.join(ROOT, "src/pages/OrganizationManagement.tsx"), "utf8");
    expect(page).toMatch(/Add another organization/);
    expect(page).toMatch(/createAdditionalOrganization/);
    expect(page).toMatch(/persistAdditionalOrgSession/);
    expect(page).toMatch(/window\.location\.assign\(path\)/);
    expect(page).toMatch(/queryClient\.clear\(\)/);
    expect(page).not.toMatch(/existingOrgs\.length > 0/);
    expect(page).not.toMatch(/You already have an organization/);
    expect(page).not.toMatch(/platform_create_organization/);
  });

  it("WhatsApp seed restore does not rewrite create_organization", async () => {
    const restore = await readFile(
      path.join(ROOT, "supabase/migrations/20261221120000_seed_organization_whatsapp_settings.sql"),
      "utf8",
    );
    expect(restore).toMatch(/CREATE OR REPLACE FUNCTION public\.seed_organization_whatsapp_settings/);
    expect(restore).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_organization/);
    expect(restore).not.toMatch(/CREATE OR REPLACE FUNCTION public\.platform_create_organization/);
  });
});
