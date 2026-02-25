import { useNavigate, useParams, NavigateOptions } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCallback } from "react";
import { getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug } from "@/lib/orgSlug";
/**
 * Hook for organization-aware navigation
 * All internal navigation should use this hook to maintain org context in URLs
 */
export function useOrgNavigation() {
  const navigate = useNavigate();
  const { orgSlug: urlOrgSlug } = useParams<{ orgSlug: string }>();
  const { currentOrganization } = useOrganization();

  // Get the current org slug from URL params, organization context, or storage (PWA resilience)
  const getOrgSlug = useCallback(() => {
    const fromUrl = isValidOrgSlug(urlOrgSlug) ? normalizeOrgSlug(urlOrgSlug) : "";
    const fromContext = isValidOrgSlug(currentOrganization?.slug) ? normalizeOrgSlug(currentOrganization?.slug) : "";
    const fromStorage = getStoredOrgSlug() || "";

    return fromUrl || fromContext || fromStorage;
  }, [urlOrgSlug, currentOrganization?.slug]);

  const orgSlug = getOrgSlug();

  /**
   * Navigate to an org-scoped path
   * @param path - The path without org slug (e.g., "/products", "/pos-sales")
   * @param options - Optional navigation options (state, replace, etc.)
   */
  const orgNavigate = useCallback((path: string, options?: NavigateOptions) => {
    // Get fresh org slug at navigation time (in case context wasn't ready when hook mounted)
    const effectiveOrgSlug = getOrgSlug();
    
    // Skip org-scoping for certain paths (public routes)
    if (path.startsWith("/auth") || 
        path.startsWith("/platform-admin") || 
        path.startsWith("/invoice/view") ||
        path.startsWith("/organization-setup") ||
        path.startsWith("/pay")) {
      navigate(path, options);
      return;
    }
    
    if (!effectiveOrgSlug) {
      // If still no org slug available, log warning and fallback
      console.warn("useOrgNavigation: No org slug available for path:", path);
      navigate(path, options);
      return;
    }

    // Handle root path
    if (path === "/" || path === "") {
      navigate(`/${effectiveOrgSlug}`, options);
      return;
    }

    // Remove leading slash if present for consistent formatting
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    navigate(`/${effectiveOrgSlug}/${cleanPath}`, options);
  }, [navigate, getOrgSlug]);

  /**
   * Get the org-prefixed path for use in Link components
   * @param path - The path without org slug
   */
  const getOrgPath = useCallback((path: string) => {
    const effectiveOrgSlug = getOrgSlug();
    
    // Skip org-scoping for certain paths (public routes)
    if (path.startsWith("/auth") || 
        path.startsWith("/platform-admin") || 
        path.startsWith("/invoice/view") ||
        path.startsWith("/organization-setup") ||
        path.startsWith("/pay")) {
      return path;
    }
    
    if (!effectiveOrgSlug) return path;
    
    if (path === "/" || path === "") {
      return `/${effectiveOrgSlug}`;
    }

    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `/${effectiveOrgSlug}/${cleanPath}`;
  }, [getOrgSlug]);

  return { 
    orgNavigate, 
    getOrgPath, 
    orgSlug,
    // For backwards compatibility with existing navigate calls
    navigate: orgNavigate
  };
}
