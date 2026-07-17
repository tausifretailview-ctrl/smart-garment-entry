import { Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { WifiOff, RefreshCw } from "lucide-react";
import { AppBootSplash } from "@/components/AppBootSplash";
import { hideAppBootSplash } from "@/lib/appBootSplash";
import { getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug, getOrgSlugFromUrl, storeOrgSlug } from "@/lib/orgSlug";
import { resolveOrgLoginPath } from "@/lib/orgLoginRedirect";
import { resolveStartupOrgSlug } from "@/lib/bundledOrg";

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
    hideAppBootSplash();
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
    // Branded splash (HTML + React) — avoids white screen + tiny spinner on Windows app cold start
    return <AppBootSplash message={isFieldSalesPWA() ? "Starting Field Sales…" : "Starting Ezzy ERP…"} />;
  }

  if (!user) {
    // Let organization setup render for logged-out users (avoid self-redirect loop)
    if (location.pathname === "/organization-setup") {
      return <>{children}</>;
    }

    // Get org slug from URL params or storage
    const normalizedUrlSlug = isValidOrgSlug(urlOrgSlug) ? normalizeOrgSlug(urlOrgSlug) : null;
    if (normalizedUrlSlug) {
      storeOrgSlug(normalizedUrlSlug); // persist latest known slug across layers
    }

    const orgSlug = normalizedUrlSlug || resolveStartupOrgSlug();

    if (orgSlug) {
      // Redirect to organization-specific login
      return <Navigate to={`/${orgSlug}`} replace />;
    }

    // Last resort: org URL picker (never platform-admin /auth)
    return <Navigate to={resolveOrgLoginPath()} replace />;
  }

  return <>{children}</>;
};
