import { storeOrgSlug } from "@/lib/orgSlug";

export type CreatedOrganization = {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
};

export type CreateOrganizationRpcClient = {
  rpc: (
    fn: "create_organization",
    args: { p_name: string; p_user_id: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function asCreatedOrganization(data: unknown, fallbackName: string): CreatedOrganization {
  if (!data || typeof data !== "object") {
    throw new Error("Organization created but no data returned");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) {
    throw new Error("Organization created but no id returned");
  }
  const slug = typeof row.slug === "string" && row.slug ? row.slug : row.id;
  return {
    id: row.id,
    name: typeof row.name === "string" && row.name ? row.name : fallbackName,
    slug,
    subscription_tier:
      typeof row.subscription_tier === "string" && row.subscription_tier
        ? row.subscription_tier
        : "free",
  };
}

/**
 * Self-serve additional firm for an existing org admin.
 * Uses `create_organization` (independent tenant, default Free tier, caller becomes admin).
 * Intentionally does NOT inspect existing `organization_members` — a second org is allowed.
 */
export async function createAdditionalOrganization(
  client: CreateOrganizationRpcClient,
  params: { name: string; userId: string },
): Promise<CreatedOrganization> {
  const name = params.name.trim();
  if (!name) {
    throw new Error("Organization name is required");
  }
  if (!params.userId) {
    throw new Error("You must be signed in to create an organization");
  }

  const { data, error } = await client.rpc("create_organization", {
    p_name: name,
    p_user_id: params.userId,
  });
  if (error) {
    throw new Error(error.message || "Failed to create organization");
  }
  return asCreatedOrganization(data, name);
}

/** Point the live session at the new org so CompactOrgSwitcher and OrgLayout pick it up. */
export function persistAdditionalOrgSession(
  userId: string,
  org: Pick<CreatedOrganization, "id" | "slug">,
): string {
  localStorage.setItem(`currentOrgId_${userId}`, org.id);
  storeOrgSlug(org.slug);
  return `/${org.slug}`;
}
