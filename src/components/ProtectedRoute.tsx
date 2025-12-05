import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

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
    // Get org slug from URL params or localStorage
    const orgSlug = urlOrgSlug || localStorage.getItem("selectedOrgSlug");
    
    if (orgSlug) {
      // Redirect to organization-specific login
      return <Navigate to={`/${orgSlug}`} replace />;
    }
    
    // Fallback to default auth page
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};
