import { Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
import { getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug, getOrgSlugFromUrl } from "@/lib/orgSlug";

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
  const { user, loading, connectionTimedOut, retryConnection } = useAuth();
  const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();
  const location = useLocation();

  // Preserve Field Sales PWA context if navigating to salesman routes
  if (location.pathname.includes('/salesman')) {
    sessionStorage.setItem('fieldSalesPWA', 'true');
  }

  // Connection timeout - show retry screen
  if (connectionTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-content-center bg-background">
        <div className="text-center p-6 max-w-sm mx-auto">
          <WifiOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Connection Problem</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Unable to connect to the server. Please check your internet connection and try again.
          </p>
          <button
            onClick={retryConnection}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
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
    const orgSlug = normalizedUrlSlug || getStoredOrgSlug() || getOrgSlugFromUrl();

    if (orgSlug) {
      // Redirect to organization-specific login
      return <Navigate to={`/${orgSlug}`} replace />;
    }
    
    // Last resort: send to organization setup where they can enter their slug
    return <Navigate to="/organization-setup" replace />;
  }

  return <>{children}</>;
};
