import { useEffect, useState } from "react";
import { Outlet, useParams, Navigate, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import OrgAuth from "@/pages/OrgAuth";

export const OrgLayout = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, loading: authLoading } = useAuth();
  const { currentOrganization, organizations, loading: orgLoading, switchOrganization } = useOrganization();
  const [isOrgSynced, setIsOrgSynced] = useState(false);
  const location = useLocation();

  // Check if this is a public invoice view route (no auth required)
  const isPublicInvoiceRoute = location.pathname.includes('/invoice/view/');

  useEffect(() => {
    if (orgSlug && user && !orgLoading && organizations.length > 0) {
      // Find the organization by slug
      const targetOrg = organizations.find(org => org.slug === orgSlug);
      
      if (targetOrg) {
        if (currentOrganization?.slug === orgSlug) {
          // Already synced
          setIsOrgSynced(true);
        } else {
          // Switch to the organization from the URL
          switchOrganization(targetOrg.id);
        }
        
        // Store the slug for PWA support
        localStorage.setItem("selectedOrgSlug", orgSlug);
      }
    }
  }, [orgSlug, user, organizations, orgLoading, currentOrganization, switchOrganization]);

  // Update sync state when currentOrganization matches URL
  useEffect(() => {
    if (currentOrganization?.slug === orgSlug) {
      setIsOrgSynced(true);
    }
  }, [currentOrganization, orgSlug]);

  // For public invoice routes, allow access without authentication
  if (isPublicInvoiceRoute) {
    // Store org slug for context even for public views
    if (orgSlug) {
      localStorage.setItem("selectedOrgSlug", orgSlug);
    }
    return <Outlet />;
  }

  // Show loading while auth or org data is being fetched
  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, render org login page directly (avoid redirect loop)
  if (!user) {
    return <OrgAuth />;
  }

  // Check if user belongs to this organization
  const userBelongsToOrg = organizations.some(org => org.slug === orgSlug);
  
  if (!userBelongsToOrg && organizations.length > 0) {
    // User doesn't belong to this org, redirect to their first org
    const firstOrg = organizations[0];
    return <Navigate to={`/${firstOrg.slug}`} replace />;
  }

  // Wait for organization to be synced before rendering children
  if (!isOrgSynced) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Render child routes
  return <Outlet />;
};
