import { ReactNode } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, Lock } from "lucide-react";

interface FeatureGateProps {
  children: ReactNode;
  feature: string;
  requiredTier?: "free" | "basic" | "professional" | "enterprise";
  fallback?: ReactNode;
}

export const FeatureGate = ({ children, feature, requiredTier, fallback }: FeatureGateProps) => {
  const { canAccessFeature, currentOrganization } = useOrganization();

  if (canAccessFeature(feature, requiredTier)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Feature Locked</CardTitle>
        </div>
        <CardDescription>
          This feature is not available in your current plan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Crown className="h-4 w-4 text-yellow-600" />
            <span>
              Current Plan:{" "}
              <span className="font-semibold capitalize">
                {currentOrganization?.subscription_tier}
              </span>
            </span>
          </div>
          {requiredTier && (
            <div className="text-sm text-muted-foreground">
              Required Plan:{" "}
              <span className="font-semibold capitalize">{requiredTier}</span>
            </div>
          )}
          <Button variant="outline" className="w-full">
            Upgrade Plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
