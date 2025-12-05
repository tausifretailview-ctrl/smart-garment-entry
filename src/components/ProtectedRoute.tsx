import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Check for saved organization slug to redirect to org-specific login
    const savedOrgSlug = localStorage.getItem("selectedOrgSlug");
    if (savedOrgSlug) {
      return <Navigate to={`/${savedOrgSlug}`} replace />;
    }
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};
