import { Navigate, useParams } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Loader2 } from "lucide-react";

type AppRole = "admin" | "manager" | "user" | "platform_admin";

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export const RoleProtectedRoute = ({ 
  children, 
  allowedRoles,
  redirectTo
}: RoleProtectedRouteProps) => {
  const { roles, loading } = useUserRoles();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { currentOrganization } = useOrganization();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasRequiredRole = roles.some(role => allowedRoles.includes(role));

  if (!hasRequiredRole) {
    // Use org-scoped redirect if available
    const slug = orgSlug || currentOrganization?.slug || localStorage.getItem("selectedOrgSlug");
    const redirectPath = redirectTo || (slug ? `/${slug}` : "/");
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};
