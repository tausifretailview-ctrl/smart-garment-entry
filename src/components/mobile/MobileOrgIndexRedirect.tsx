import { Suspense, lazy } from "react";
import { Navigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MOBILE_DEFAULT_LANDING_PATH } from "@/lib/mobileShell";
import { MenuPermissionRoute } from "@/components/MenuPermissionRoute";
import { Layout } from "@/components/Layout";

const Index = lazy(() => import("@/pages/Index"));

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

/**
 * Org home (`/:orgSlug`): desktop shows main dashboard; mobile opens `/mobile-sales`.
 */
export function MobileOrgIndexRedirect() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <Navigate to={MOBILE_DEFAULT_LANDING_PATH.replace(/^\//, "")} replace />;
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
