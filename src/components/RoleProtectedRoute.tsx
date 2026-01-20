import { Navigate, useParams } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const { roles, loading, error } = useUserRoles(currentOrganization?.id);

  // Show loading while fetching roles or organization
  if (loading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If there was an error fetching roles, show error with retry option instead of redirecting
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">Unable to verify permissions</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
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
