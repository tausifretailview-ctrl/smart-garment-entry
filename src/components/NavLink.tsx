import { NavLink as RouterNavLink, NavLinkProps, useParams } from "react-router-dom";
import { forwardRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug } from "@/lib/orgSlug";
import { prefetchTabPage } from "@/lib/tabPageRegistry";
interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  (
    {
      className,
      activeClassName,
      pendingClassName,
      to,
      onMouseEnter,
      onFocus,
      onPointerDown,
      onTouchStart,
      ...props
    },
    ref,
  ) => {
    const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();
    const { currentOrganization } = useOrganization();
    
    // Get org slug from URL params, context, or storage (PWA resilience)
    const orgSlug = useMemo(() => {
      const fromUrl = isValidOrgSlug(urlOrgSlug) ? normalizeOrgSlug(urlOrgSlug) : "";
      const fromContext = isValidOrgSlug(currentOrganization?.slug) ? normalizeOrgSlug(currentOrganization?.slug) : "";
      const fromStorage = getStoredOrgSlug() || "";

      return fromUrl || fromContext || fromStorage;
    }, [urlOrgSlug, currentOrganization?.slug]);

    // Convert the path to org-scoped path
    const orgScopedTo = useMemo(() => {
      const path = typeof to === "string" ? to : to.pathname || "";
      
      // Skip org-scoping for public routes. Exact `/pay` or `/pay/...` only —
      // `/payments-dashboard` must stay org-scoped.
      if (path.startsWith("/auth") ||
          path.startsWith("/platform-admin") ||
          path.startsWith("/invoice/view") ||
          path.startsWith("/organization-setup") ||
          path === "/pay" ||
          path.startsWith("/pay/")) {
        return to;
      }
      
      // If no orgSlug available, still try to get it synchronously from storage
      const effectiveOrgSlug = orgSlug || getStoredOrgSlug() || "";
      
      if (!effectiveOrgSlug) {
        // If still no org slug, return the path as-is (fallback, shouldn't happen in normal flow)
        console.warn("NavLink: No org slug available for path:", path);
        return to;
      }
      
      // Skip if path already contains the org slug
      if (path.startsWith(`/${effectiveOrgSlug}/`) || path === `/${effectiveOrgSlug}`) {
        return to;
      }

      // Handle root path
      if (path === "/" || path === "") {
        return `/${effectiveOrgSlug}`;
      }

      // Prepend org slug to path
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return `/${effectiveOrgSlug}/${cleanPath}`;
    }, [to, orgSlug]);

    const tabPathFromTo = useCallback(() => {
      const path = typeof to === "string" ? to : to.pathname || "";
      if (
        path.startsWith("/auth") ||
        path.startsWith("/platform-admin") ||
        path.startsWith("/invoice/view") ||
        path.startsWith("/organization-setup") ||
        path === "/pay" ||
        path.startsWith("/pay/")
      ) {
        return null;
      }
      return path === "/" || path === "" ? "" : path.replace(/^\/+/, "");
    }, [to]);

    /** Hover / keyboard focus — speculative; skipped on Save-Data / 2g. */
    const prefetchSpeculative = useCallback(() => {
      const cleanPath = tabPathFromTo();
      if (cleanPath === null) return;
      prefetchTabPage(cleanPath);
    }, [tabPathFromTo]);

    /**
     * Touch / click-imminent — intent. Sidebar is mostly NavLinks; without this,
     * touch devices never warm the chunk before navigate (no hover).
     */
    const prefetchIntent = useCallback(() => {
      const cleanPath = tabPathFromTo();
      if (cleanPath === null) return;
      prefetchTabPage(cleanPath, { intent: true });
    }, [tabPathFromTo]);

    return (
      <RouterNavLink
        ref={ref}
        to={orgScopedTo}
        onMouseEnter={(e) => {
          prefetchSpeculative();
          onMouseEnter?.(e);
        }}
        onFocus={(e) => {
          prefetchSpeculative();
          onFocus?.(e);
        }}
        onPointerDown={(e) => {
          prefetchIntent();
          onPointerDown?.(e);
        }}
        onTouchStart={(e) => {
          prefetchIntent();
          onTouchStart?.(e);
        }}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
