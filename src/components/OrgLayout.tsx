import { useEffect } from "react";
import { Outlet, useParams, Navigate } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export const OrgLayout = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, loading: authLoading } = useAuth();
  const { currentOrganization, organizations, loading: orgLoading, switchOrganization } = useOrganization();

  useEffect(() => {
    if (orgSlug && user && !orgLoading && organizations.length > 0) {
      // Find the organization by slug
      const targetOrg = organizations.find(org => org.slug === orgSlug);
      
      if (targetOrg && currentOrganization?.slug !== orgSlug) {
        // Switch to the organization from the URL
        switchOrganization(targetOrg.id);
      }
      
      // Store the slug for PWA support
      localStorage.setItem("selectedOrgSlug", orgSlug);
    }
  }, [orgSlug, user, organizations, orgLoading, currentOrganization, switchOrganization]);

  // Show loading while auth or org data is being fetched
  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, redirect to org login page
  if (!user) {
    return <Navigate to={`/${orgSlug}`} replace />;
  }

  // Check if user belongs to this organization
  const userBelongsToOrg = organizations.some(org => org.slug === orgSlug);
  
  if (!userBelongsToOrg && organizations.length > 0) {
    // User doesn't belong to this org, redirect to their first org
    const firstOrg = organizations[0];
    return <Navigate to={`/${firstOrg.slug}`} replace />;
  }

  // Render child routes
  return <Outlet />;
};
