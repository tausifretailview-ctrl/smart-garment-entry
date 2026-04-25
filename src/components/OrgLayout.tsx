import { useEffect, useState } from "react";
import { Outlet, useParams, Navigate, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import OrgAuth from "@/pages/OrgAuth";
import { storeOrgSlug } from "@/lib/orgSlug";
export const OrgLayout = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, loading: authLoading } = useAuth();
  const { currentOrganization, organizations, loading: orgLoading, switchOrganization } = useOrganization();
  const [isOrgSynced, setIsOrgSynced] = useState(false);
  const [syncTimeout, setSyncTimeout] = useState(false);
  const location = useLocation();

  // Safety timeout: if org sync takes too long (8s), force render to prevent infinite spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOrgSynced) {
        console.warn("OrgLayout: Sync timeout reached, forcing render");
        setSyncTimeout(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isOrgSynced]);

  // Check if this is a public route (no auth required)
  const isPublicInvoiceRoute = location.pathname.includes('/invoice/view/');
  const isPublicInstallRoute = /^\/[^/]+\/install\/?$/.test(location.pathname);
  const isPublicPortalRoute = /^\/[^/]+\/portal(\/|$)/.test(location.pathname);
  const isFieldSalesRoute = /^\/[^/]+\/field-sales\/?$/.test(location.pathname);
  const isPublicRoute = isPublicInvoiceRoute || isPublicInstallRoute || isPublicPortalRoute || isFieldSalesRoute;

  useEffect(() => {
    if (orgSlug && user && !orgLoading && organizations.length > 0) {
      // Find the organization by slug
      const targetOrg = organizations.find(org => org.slug === orgSlug);
      
      if (targetOrg) {
        // Always switch if URL org doesn't match current org - force sync
        if (currentOrganization?.id !== targetOrg.id) {
          ;
          switchOrganization(targetOrg.id);
          // Mark synced after a short delay to allow state to update
          setTimeout(() => setIsOrgSynced(true), 500);
        } else {
          // Already synced
          setIsOrgSynced(true);
        }
        
        // Store the slug in both localStorage and sessionStorage for PWA resilience
        storeOrgSlug(orgSlug);
      }
    }
  }, [orgSlug, user, organizations, orgLoading, currentOrganization?.id, switchOrganization]);

  // Update sync state when currentOrganization matches URL
  useEffect(() => {
    if (currentOrganization?.slug === orgSlug) {
      setIsOrgSynced(true);
    }
  }, [currentOrganization, orgSlug]);

  // For public routes, allow access without authentication
  if (isPublicRoute) {
    // Store org slug for context even for public views (in both storages)
    if (orgSlug) {
      storeOrgSlug(orgSlug);
    }
    return <Outlet />;
  }

  // Show loading only while auth is being determined
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, render org login page immediately (don't wait for orgLoading)
  if (!user) {
    return <OrgAuth />;
  }

  // Only wait for org loading when user IS authenticated
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if user belongs to this organization
  const userBelongsToOrg = organizations.some(org => org.slug === orgSlug);
  
  if (!userBelongsToOrg && organizations.length > 0) {
    // User doesn't belong to this org, redirect to their first org
    const firstOrg = organizations[0];
    return <Navigate to={`/${firstOrg.slug}`} replace />;
  }

  // Wait for organization to be synced before rendering children (with timeout fallback)
  if (!isOrgSynced && !syncTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Render child routes
  return <Outlet />;
};
