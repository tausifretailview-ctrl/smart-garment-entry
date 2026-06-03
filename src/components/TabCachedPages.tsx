import { Suspense, useMemo } from "react";
import {
  getLazyTabPage,
  TAB_PAGE_REGISTRY,
  type TabPageLayout,
  type TabPageRole,
} from "@/lib/tabPageRegistry";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { Layout } from "@/components/Layout";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { POSLayout } from "@/components/POSLayout";
import { cn } from "@/lib/utils";

function TabPageFallback({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex flex-1 items-center justify-center min-h-[200px]">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function wrapWithLayout(layout: TabPageLayout, page: React.ReactNode) {
  switch (layout) {
    case "pos":
      return <POSLayout>{page}</POSLayout>;
    case "fullscreen":
      return <FullScreenLayout>{page}</FullScreenLayout>;
    default:
      return <Layout>{page}</Layout>;
  }
}

function CachedTabPane({
  path,
  active,
  roles,
  layout,
}: {
  path: string;
  active: boolean;
  roles?: TabPageRole[];
  layout: TabPageLayout;
}) {
  const LazyPage = getLazyTabPage(path);
  if (!LazyPage) return null;

  const page = (
    <Suspense fallback={<TabPageFallback active={active} />}>
      <LazyPage />
    </Suspense>
  );

  const withLayout = wrapWithLayout(layout, page);
  const withRole =
    roles && roles.length > 0 ? (
      <RoleProtectedRoute allowedRoles={roles}>{withLayout}</RoleProtectedRoute>
    ) : (
      withLayout
    );

  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        active ? "flex-1 h-full w-full" : "hidden",
      )}
      aria-hidden={!active}
      data-tab-cache-path={path}
    >
      <ProtectedRoute>{withRole}</ProtectedRoute>
    </div>
  );
}

type TabCachedPagesProps = {
  /** Paths to keep mounted (open window tabs). */
  paths: string[];
  /** Current URL path segment — which cached pane is visible. */
  activePath: string;
};

/**
 * Tally-style window tabs: keep each open module mounted (hidden) so switching
 * tabs does not reload lazy chunks or lose form state.
 */
export function TabCachedPages({ paths, activePath }: TabCachedPagesProps) {
  const uniquePaths = useMemo(
    () => [...new Set(paths.filter((p) => getLazyTabPage(p)))],
    [paths],
  );

  if (uniquePaths.length === 0) return null;

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 h-full w-full overflow-hidden">
      {uniquePaths.map((path) => {
        const meta = TAB_PAGE_REGISTRY[path];
        if (!meta || !getLazyTabPage(path)) return null;
        return (
          <CachedTabPane
            key={path}
            path={path}
            active={path === activePath}
            layout={meta.layout}
            roles={meta.roles}
          />
        );
      })}
    </div>
  );
}
