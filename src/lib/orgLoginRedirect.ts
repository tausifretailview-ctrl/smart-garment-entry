import { resolveStartupOrgSlug } from "@/lib/bundledOrg";

/**
 * Where to send a user who needs to sign in as an organization user.
 * Never use /auth here — that route is platform-admin only.
 */
export function resolveOrgLoginPath(): string {
  const slug = resolveStartupOrgSlug();
  return slug ? `/${slug}` : "/organization-setup";
}

/** True when the user explicitly opened the platform-admin login screen. */
export function isPlatformAdminLoginIntent(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("platform") === "1" || params.get("admin") === "1";
}
