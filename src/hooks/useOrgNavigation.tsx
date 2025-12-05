import { useNavigate, useParams } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCallback } from "react";

/**
 * Hook for organization-aware navigation
 * All internal navigation should use this hook to maintain org context in URLs
 */
export function useOrgNavigation() {
  const navigate = useNavigate();
  const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();
  const { currentOrganization } = useOrganization();

  // Get the current org slug from URL params or organization context
  const orgSlug = urlOrgSlug || currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || "";

  /**
   * Navigate to an org-scoped path
   * @param path - The path without org slug (e.g., "/products", "/pos-sales")
   */
  const orgNavigate = useCallback((path: string) => {
    if (!orgSlug) {
      // Fallback to regular navigation if no org context
      navigate(path);
      return;
    }

    // Handle root path
    if (path === "/" || path === "") {
      navigate(`/${orgSlug}`);
      return;
    }

    // Remove leading slash if present for consistent formatting
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    navigate(`/${orgSlug}/${cleanPath}`);
  }, [navigate, orgSlug]);

  /**
   * Get the org-prefixed path for use in Link components
   * @param path - The path without org slug
   */
  const getOrgPath = useCallback((path: string) => {
    if (!orgSlug) return path;
    
    if (path === "/" || path === "") {
      return `/${orgSlug}`;
    }

    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `/${orgSlug}/${cleanPath}`;
  }, [orgSlug]);

  return { 
    orgNavigate, 
    getOrgPath, 
    orgSlug,
    // For backwards compatibility with existing navigate calls
    navigate: orgNavigate
  };
}
