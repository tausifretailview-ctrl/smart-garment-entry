import { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";

interface MenuPermissionRouteProps {
  permission: string;
  children: ReactNode;
}

export const MenuPermissionRoute = ({ permission, children }: MenuPermissionRouteProps) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { currentOrganization, organizationRole, loading: orgLoading } = useOrganization();
  const { permissions, hasMenuAccess, loading: permissionsLoading } = useUserPermissions();

  if (orgLoading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAdminWithoutCustomRights = organizationRole === "admin" && permissions === null;
  const isAllowed = isAdminWithoutCustomRights || hasMenuAccess(permission);

  if (!isAllowed) {
    const slug = orgSlug || currentOrganization?.slug || localStorage.getItem("selectedOrgSlug");
    return <Navigate to={slug ? `/${slug}` : "/"} replace />;
  }

  return <>{children}</>;
};