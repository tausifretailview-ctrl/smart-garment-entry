import { Suspense, lazy } from "react";
import { Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveMobileLandingPath } from "@/lib/menuPermissions";
import { MenuPermissionRoute } from "@/components/MenuPermissionRoute";
import { Layout } from "@/components/Layout";

const Index = lazy(() => import("@/pages/Index"));

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

/**
 * Org home (`/:orgSlug`): desktop shows main dashboard; mobile / native APK opens business overview.
 * Native always uses the mobile landing — force-desktop must not leave phones on the desktop Index gate.
 * When Main Dashboard is disabled in User Rights, mobile must not show OwnerDashboard KPI cards.
 */
export function MobileOrgIndexRedirect() {
  const isMobile = useIsMobile();
  const isNative = Capacitor.isNativePlatform();
  const { organizationRole, loading: orgLoading } = useOrganization();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();

  if (isNative || isMobile) {
    if (orgLoading || permissionsLoading) {
      return <PageFallback />;
    }
    const landing = resolveMobileLandingPath(hasMenuAccess, permissions, organizationRole);
    return <Navigate to={landing} replace />;
  }

  return (
    <MenuPermissionRoute permission="main_dashboard">
      <Layout>
        <Suspense fallback={<PageFallback />}>
          <Index />
        </Suspense>
      </Layout>
    </MenuPermissionRoute>
  );
}
