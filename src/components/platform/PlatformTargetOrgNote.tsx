import { Building2 } from "lucide-react";

export type PlatformTargetOrg = { name: string; slug?: string | null; organization_number?: number | null };

/** "Add to LAGNEE SAREES" / "Create user in LAGNEE SAREES": the button says which shop. */
export function platformTargetOrgButtonLabel(verb: string, org: PlatformTargetOrg | null | undefined): string {
  const name = String(org?.name || "").trim();
  if (!name) return verb;
  return `${verb} in ${name.length > 28 ? `${name.slice(0, 27)}…` : name}`;
}

/**
 * Platform Admin → Create User / Assign User: the shop the login is about to be added to, shown
 * large with its number and login page. Picking the wrong shop from a long list was how a
 * login ended up in another shop and could not sign in to its own (Nov 2026).
 */
export function PlatformTargetOrgNote({ org }: { org: PlatformTargetOrg | null | undefined }) {
  if (!org) {
    return (
      <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
        Choose the shop first. The login will work only on that shop's login page.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2" role="status">
      <p className="text-xs font-medium text-emerald-900">This login will be added to</p>
      <p className="flex items-center gap-2 text-lg font-bold leading-tight text-emerald-950">
        <Building2 className="h-5 w-5 shrink-0" />
        <span className="min-w-0 break-words">{org.name}</span>
      </p>
      <p className="text-xs text-emerald-900">
        {org.organization_number != null ? `Shop #${org.organization_number} · ` : ""}
        {org.slug ? `login page /${org.slug}` : ""}
      </p>
    </div>
  );
}
