import { Navigate, useParams } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useOrganization } from "@/contexts/OrganizationContext";
import { resolveOrgLoginPath } from "@/lib/orgLoginRedirect";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const inTabCachePane = useTabCacheLayout();
  const loadingShellClass = cn(
    "flex items-center justify-center",
    inTabCachePane ? "h-full min-h-0 w-full" : "min-h-screen",
  );
  
  // Check if this is a platform-admin-only route (no org context needed)
  const isPlatformAdminOnly = allowedRoles.length === 1 && allowedRoles[0] === "platform_admin";
  
  // For platform admin routes, don't pass org ID - we only need global roles
  const { roles, loading, error, refetch } = useUserRoles(
    isPlatformAdminOnly ? undefined : currentOrganization?.id
  );
  const isWaiting = loading || (!isPlatformAdminOnly && orgLoading);

  // For platform admin routes, don't wait for org context
  if (isWaiting && !error) {
    return (
      <div className={loadingShellClass}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If there was an error fetching roles, show error with in-place retry (no full reload)
  if (error) {
    return (
      <div className={loadingShellClass}>
        <div className="text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">Unable to verify permissions</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const hasRequiredRole = roles.some(role => allowedRoles.includes(role));

  if (!hasRequiredRole) {
    // For platform admin routes, send org users to their shop login (not /auth)
    if (isPlatformAdminOnly) {
      return <Navigate to={resolveOrgLoginPath()} replace />;
    }
    
    // For org-scoped routes, redirect to org dashboard
    const slug = orgSlug || currentOrganization?.slug || localStorage.getItem("selectedOrgSlug");
    const redirectPath = redirectTo || (slug ? `/${slug}` : "/");
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};
