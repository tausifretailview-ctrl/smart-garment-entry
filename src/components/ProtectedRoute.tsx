import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

// Helper to get org slug from multiple storage locations (PWA resilience)
const getStoredOrgSlug = (): string | null => {
  return localStorage.getItem("selectedOrgSlug") 
    || sessionStorage.getItem("selectedOrgSlug") 
    || null;
};

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Get org slug from URL params or storage (check both localStorage and sessionStorage)
    const orgSlug = urlOrgSlug || getStoredOrgSlug();
    
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
