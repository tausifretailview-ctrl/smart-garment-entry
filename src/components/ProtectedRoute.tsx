import { Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug } from "@/lib/orgSlug";

// Check if this is a Field Sales PWA context
const isFieldSalesPWA = (): boolean => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('app') === 'fieldsales') {
    sessionStorage.setItem('fieldSalesPWA', 'true');
    return true;
  }
  return sessionStorage.getItem('fieldSalesPWA') === 'true';
};

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();
  const location = useLocation();

  // Preserve Field Sales PWA context if navigating to salesman routes
  if (location.pathname.includes('/salesman')) {
    sessionStorage.setItem('fieldSalesPWA', 'true');
  }

  if (loading) {
    // Show orange spinner for Field Sales PWA
    const isFieldSales = isFieldSalesPWA();
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className={`h-8 w-8 animate-spin ${isFieldSales ? 'text-orange-500' : 'text-primary'}`} />
      </div>
    );
  }

  if (!user) {
    // Get org slug from URL params or storage (check both localStorage and sessionStorage)
    const normalizedUrlSlug = isValidOrgSlug(urlOrgSlug) ? normalizeOrgSlug(urlOrgSlug) : null;
    const orgSlug = normalizedUrlSlug || getStoredOrgSlug();

    if (orgSlug) {
      // Redirect to organization-specific login
      return <Navigate to={`/${orgSlug}`} replace />;
    }
    
    // Redirect to organization setup page instead of platform admin auth
    // This allows users to enter their org slug and navigate to their login
    return <Navigate to="/organization-setup" replace />;
  }

  return <>{children}</>;
};
