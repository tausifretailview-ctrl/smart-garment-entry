import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = "supabase/migrations/20260906120000_get_organization_login_history.sql";
const ORG_AUTH = "src/pages/OrgAuth.tsx";
const ORG_MGMT = "src/pages/OrganizationManagement.tsx";

const ANON_GUARD = `IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;`;

const ORG_GUARD = `IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;`;

describe("get_organization_login_history RPC", () => {
  const sql = readFileSync(join(root, MIGRATION), "utf8");

  it("uses the fail-closed auth.role() guard, not uid-IS-NOT-NULL skip", () => {
    expect(sql).toContain(ANON_GUARD);
    expect(sql).toContain(ORG_GUARD);
    expect(sql).not.toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+THEN/i);
  });

  it("caps the result at 200 even if the caller asks for more", () => {
    expect(sql).toMatch(/LIMIT LEAST\(/);
    expect(sql).toContain("200");
  });

  it("filters LOGIN rows for the requested org only", () => {
    expect(sql).toMatch(/al\.organization_id = p_org_id/);
    expect(sql).toMatch(/al\.action = 'LOGIN'/);
  });

  it("revokes PUBLIC/anon and grants authenticated + service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_organization_login_history\(uuid, integer\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_organization_login_history\(uuid, integer\) FROM anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_organization_login_history\(uuid, integer\) TO authenticated, service_role/,
    );
  });

  it("allows only own LOGIN/auth inserts (audit_logs is otherwise insert-blocked)", () => {
    expect(sql).toContain("Members can insert own LOGIN audit rows");
    expect(sql).toMatch(/action = 'LOGIN'/);
    expect(sql).toMatch(/entity_type = 'auth'/);
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/);
  });
});

describe("OrgAuth LOGIN insert point", () => {
  const src = readFileSync(join(root, ORG_AUTH), "utf8");

  it("logs after both membership branches converge and does not await the insert", () => {
    const membershipReturn = src.lastIndexOf("You are not a member of this organization");
    const logCall = src.indexOf("logSuccessfulOrgLogin(");
    const storeSlug = src.indexOf("storeOrgSlug(resolvedOrg.slug)");
    expect(logCall).toBeGreaterThan(membershipReturn);
    expect(logCall).toBeGreaterThan(-1);
    expect(storeSlug).toBeGreaterThan(logCall);
    expect(src).not.toMatch(/await\s+logSuccessfulOrgLogin/);
    expect(src).not.toMatch(/await\s+supabase\s*\n?\s*\.from\("audit_logs"\)/);
  });

  it("does not log on the failed-password path (authError returns first)", () => {
    const authError = src.indexOf("if (authError)");
    const logCall = src.indexOf("logSuccessfulOrgLogin(");
    expect(authError).toBeGreaterThan(-1);
    expect(logCall).toBeGreaterThan(authError);
  });
});

describe("Organization Management Activity tab", () => {
  const src = readFileSync(join(root, ORG_MGMT), "utf8");

  it("adds Activity beside Members without a tighter visibility rule", () => {
    expect(src).toContain('<TabsTrigger value="activity">Activity</TabsTrigger>');
    expect(src).toContain('<TabsContent value="activity"');
    expect(src).toContain('queryKey: ["org-login-history", currentOrganization?.id]');
    expect(src).not.toMatch(/value="activity"[\s\S]{0,80}isAdmin/);
  });

  it("reuses the Members query options (no invented staleTime)", () => {
    const membersBlock = src.slice(src.indexOf("organization-members"), src.indexOf("updateOrgMutation"));
    const activityBlock = src.slice(src.indexOf("org-login-history"), src.indexOf("updateOrgMutation"));
    expect(membersBlock).not.toContain("staleTime");
    expect(activityBlock).not.toContain("staleTime");
    expect(activityBlock).toContain("enabled: !!currentOrganization");
  });

  it("matches Members list row chrome and omits IP", () => {
    expect(src).toContain('className="flex items-center justify-between py-3 border-b last:border-0"');
    expect(src).toContain("No login activity recorded yet.");
    expect(src).not.toMatch(/ip_address/);
  });
});
