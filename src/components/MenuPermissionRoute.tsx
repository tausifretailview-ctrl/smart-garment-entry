import { ReactNode, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { Button } from "@/components/ui/button";

interface MenuPermissionRouteProps {
  permission: string;
  children: ReactNode;
}

/** Fail-open if org/permissions hang (common on slow mobile / APK WebView). */
const PERMISSIONS_WAIT_MS = 12_000;

export const MenuPermissionRoute = ({ permission, children }: MenuPermissionRouteProps) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { currentOrganization, organizationRole, loading: orgLoading } = useOrganization();
  const { permissions, hasMenuAccess, loading: permissionsLoading } = useUserPermissions();
  const [waitTimedOut, setWaitTimedOut] = useState(false);

  useEffect(() => {
    if (!orgLoading && !permissionsLoading) {
      setWaitTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setWaitTimedOut(true), PERMISSIONS_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [orgLoading, permissionsLoading]);

  if ((orgLoading || permissionsLoading) && !waitTimedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if ((orgLoading || permissionsLoading) && waitTimedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-base font-medium text-foreground">Taking longer than usual</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Check your internet connection, then try again.
        </p>
        <Button type="button" onClick={() => window.location.reload()} className="touch-manipulation">
          Reload
        </Button>
      </div>
    );
  }

  const isAdminWithoutCustomRights = organizationRole === "admin" && permissions === null;
  const isAllowed = isAdminWithoutCustomRights || hasMenuAccess(permission);

  if (!isAllowed) {
    const slug = orgSlug || currentOrganization?.slug || localStorage.getItem("selectedOrgSlug");
    const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
    const target = slug
      ? fallback
        ? `/${slug}/${fallback}`
        : `/${slug}`
      : "/organization-setup";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
};
