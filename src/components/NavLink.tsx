import { NavLink as RouterNavLink, NavLinkProps, useParams } from "react-router-dom";
import { forwardRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();
    const { currentOrganization } = useOrganization();
    
    // Get org slug from URL params, context, or localStorage
    const orgSlug = urlOrgSlug || currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || "";

    // Convert the path to org-scoped path
    const orgScopedTo = useMemo(() => {
      if (!orgSlug) return to;
      
      const path = typeof to === "string" ? to : to.pathname || "";
      
      // Skip org-scoping for certain paths
      if (path.startsWith("/auth") || 
          path.startsWith("/platform-admin") || 
          path.startsWith("/invoice/view") ||
          path.startsWith(`/${orgSlug}`)) {
        return to;
      }

      // Handle root path
      if (path === "/" || path === "") {
        return `/${orgSlug}`;
      }

      // Prepend org slug to path
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return `/${orgSlug}/${cleanPath}`;
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
