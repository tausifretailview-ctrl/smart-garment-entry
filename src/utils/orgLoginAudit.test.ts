import { describe, expect, it, vi } from "vitest";
import {
  buildLoginAuditRow,
  fetchOrganizationLoginHistory,
  formatOrgLoginAt,
  logSuccessfulOrgLogin,
} from "./orgLoginAudit";

function mockInsertClient(result: { error: { message: string } | null }) {
  const insert = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => ({ insert }));
  return { from, insert };
}

describe("buildLoginAuditRow", () => {
  it("writes LOGIN/auth for the signed-in user and org", () => {
    expect(
      buildLoginAuditRow({
        organizationId: "org-1",
        userId: "user-1",
        userEmail: "owner@example.com",
        userAgent: "Mozilla/5.0",
      }),
    ).toEqual({
      organization_id: "org-1",
      user_id: "user-1",
      user_email: "owner@example.com",
      action: "LOGIN",
      entity_type: "auth",
      entity_id: "user-1",
      user_agent: "Mozilla/5.0",
    });
  });
});

describe("logSuccessfulOrgLogin", () => {
  it("inserts without awaiting and does not throw when logging fails", async () => {
    const { from, insert } = mockInsertClient({ error: { message: "rls" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      logSuccessfulOrgLogin({ from } as never, {
        organizationId: "org-1",
        userId: "user-1",
        userEmail: "owner@example.com",
        userAgent: "test-agent",
      }),
    ).not.toThrow();

    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(insert).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith(
      "Login audit log failed:",
      expect.objectContaining({ message: "rls" }),
    );
    errorSpy.mockRestore();
  });
});

describe("fetchOrganizationLoginHistory", () => {
  it("calls the org-scoped RPC and returns rows newest-first as the RPC sent them", async () => {
    const rows = [
      { user_email: "a@x.com", logged_in_at: "2026-09-06T10:00:00.000Z" },
      { user_email: "b@x.com", logged_in_at: "2026-09-05T10:00:00.000Z" },
    ];
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe("get_organization_login_history");
      expect(args).toEqual({ p_org_id: "org-1", p_limit: 100 });
      return { data: rows, error: null };
    });
    await expect(fetchOrganizationLoginHistory({ rpc } as never, "org-1")).resolves.toEqual(rows);
  });

  it("throws when the RPC rejects a foreign org (42501)", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Not authorized for this organization", code: "42501" },
    }));
    await expect(fetchOrganizationLoginHistory({ rpc } as never, "other-org")).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("formatOrgLoginAt", () => {
  it("formats as dd/MM/yyyy, hh:mm a", () => {
    expect(formatOrgLoginAt("2026-09-06T04:30:00.000Z")).toMatch(/^\d{2}\/\d{2}\/2026, \d{2}:\d{2} [AP]M$/);
  });
});
