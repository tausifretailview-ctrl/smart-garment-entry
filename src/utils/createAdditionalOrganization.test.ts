import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdditionalOrganization,
  persistAdditionalOrgSession,
} from "./createAdditionalOrganization";

describe("createAdditionalOrganization", () => {
  it("creates a second org for a user who already has memberships (no membership gate)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "org-2",
        name: "Second Firm",
        slug: "second-firm",
        subscription_tier: "free",
      },
      error: null,
    });
    const from = vi.fn(() => {
      throw new Error("must not query organization_members to block additional-org create");
    });

    const org = await createAdditionalOrganization(
      { rpc, from } as unknown as Parameters<typeof createAdditionalOrganization>[0],
      { name: "  Second Firm  ", userId: "user-already-in-org-1" },
    );

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_organization", {
      p_name: "Second Firm",
      p_user_id: "user-already-in-org-1",
    });
    expect(org).toEqual({
      id: "org-2",
      name: "Second Firm",
      slug: "second-firm",
      subscription_tier: "free",
    });
  });

  it("surfaces RPC errors instead of treating them as success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Not authorized for this organization" },
    });

    await expect(
      createAdditionalOrganization({ rpc }, { name: "Blocked", userId: "user-1" }),
    ).rejects.toThrow("Not authorized for this organization");
  });
});

describe("persistAdditionalOrgSession", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores the new org as current and returns its landing path", () => {
    const path = persistAdditionalOrgSession("user-1", {
      id: "org-2",
      slug: "second-firm",
    });

    expect(path).toBe("/second-firm");
    expect(localStorage.getItem("currentOrgId_user-1")).toBe("org-2");
    expect(localStorage.getItem("selectedOrgSlug")).toBe("second-firm");
  });
});
