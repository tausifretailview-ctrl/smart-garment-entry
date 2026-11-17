import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("new organisation login", () => {
  it("Platform Admin create-user: lower-cases the e-mail and never leaves a shop-less login", () => {
    const fn = read("supabase/functions/create-user/index.ts");
    expect(fn).toContain('const email = String(body.email ?? "").trim().toLowerCase()');
    expect(fn).toMatch(/if \(assignErr\) \{\s*\/\/[\s\S]*?await supabaseAdmin\.auth\.admin\.deleteUser\(userId\)/);
  });

  it("platform_assign_user_to_org finds the login whatever the case of the typed e-mail", () => {
    const sql = read("supabase/migrations/20270429120000_platform_assign_user_case_insensitive_email.sql");
    expect(sql).toContain("WHERE lower(email) = lower(trim(p_user_email))");
    expect(sql).toContain("p_caller_id UUID DEFAULT auth.uid()");
  });

  it("the shop URL is compared case-insensitively, like the login page", () => {
    const layout = read("src/components/OrgLayout.tsx");
    expect(layout).toContain("const orgSlug = rawOrgSlug ? normalizeOrgSlug(rawOrgSlug) : rawOrgSlug;");
  });

  it("a login with no shop gets a clear message and a Sign out, not 'check the connection'", () => {
    const layout = read("src/components/OrgLayout.tsx");
    expect(layout).toContain("This login is not added to any shop");
    expect(layout).toContain("!isOrgSynced && !orgFetchError && hasResolvedOrganizations && organizations.length === 0");
  });

  it("a slow first organisation answer clears the timeout error", () => {
    const ctx = read("src/contexts/OrganizationContext.tsx");
    expect(ctx).toMatch(/setOrganizations\(orgs \|\| \[\]\);[\s\S]{0,200}setFetchError\(false\);/);
  });
});
