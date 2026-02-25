import { NavLink as RouterNavLink, NavLinkProps, useParams } from "react-router-dom";
import { forwardRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug } from "@/lib/orgSlug";
interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
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
      
      // Skip org-scoping for certain paths (public routes)
      if (path.startsWith("/auth") || 
          path.startsWith("/platform-admin") || 
          path.startsWith("/invoice/view") ||
          path.startsWith("/organization-setup") ||
          path.startsWith("/pay")) {
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

    return (
      <RouterNavLink
        ref={ref}
        to={orgScopedTo}
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
