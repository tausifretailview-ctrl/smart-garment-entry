import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { Loader2 } from "lucide-react";

interface SchoolFeatureGateProps {
  children: ReactNode;
  fallbackPath?: string;
}

/**
 * Wrapper component that only renders children if the current organization is a school
 */
export const SchoolFeatureGate = ({ 
  children, 
  fallbackPath = "/" 
}: SchoolFeatureGateProps) => {
  const { isSchool, loading } = useSchoolFeatures();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSchool) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
