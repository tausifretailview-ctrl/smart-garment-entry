const ORG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizeOrgSlug = (value?: string | null): string => {
  return (value ?? "").trim().toLowerCase();
};

export const isValidOrgSlug = (value?: string | null): boolean => {
  return ORG_SLUG_PATTERN.test(normalizeOrgSlug(value));
};

// Cookie helpers for ultimate fallback persistence
const COOKIE_NAME = "orgSlug";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

const setOrgSlugCookie = (slug: string) => {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(slug)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
};

const getOrgSlugFromCookie = (): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return isValidOrgSlug(value) ? normalizeOrgSlug(value) : null;
};

export const getStoredOrgSlug = (): string | null => {
  const localRaw = localStorage.getItem("selectedOrgSlug");
  const sessionRaw = sessionStorage.getItem("selectedOrgSlug");

  const localSlug = isValidOrgSlug(localRaw) ? normalizeOrgSlug(localRaw) : null;
  const sessionSlug = isValidOrgSlug(sessionRaw) ? normalizeOrgSlug(sessionRaw) : null;

  if (localRaw && !localSlug) {
    localStorage.removeItem("selectedOrgSlug");
  }

  if (sessionRaw && !sessionSlug) {
    sessionStorage.removeItem("selectedOrgSlug");
  }

  // Three-layer fallback: localStorage -> sessionStorage -> cookie
  const resolvedSlug = localSlug || sessionSlug || getOrgSlugFromCookie();

  if (resolvedSlug) {
    // Re-sync all storage layers
    localStorage.setItem("selectedOrgSlug", resolvedSlug);
    sessionStorage.setItem("selectedOrgSlug", resolvedSlug);
    setOrgSlugCookie(resolvedSlug);
  }

  return resolvedSlug;
};

export const storeOrgSlug = (value?: string | null): string | null => {
  if (!isValidOrgSlug(value)) {
    return null;
  }

  const normalized = normalizeOrgSlug(value);
  localStorage.setItem("selectedOrgSlug", normalized);
  sessionStorage.setItem("selectedOrgSlug", normalized);
  setOrgSlugCookie(normalized);
  return normalized;
};

/**
 * Extract org slug from the current URL path.
 * Useful when localStorage/sessionStorage/cookie are all cleared
 * but the user is still on an org-scoped URL like /:orgSlug/dashboard.
 */
export const getOrgSlugFromUrl = (): string | null => {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  if (firstSegment && isValidOrgSlug(firstSegment)) {
    return normalizeOrgSlug(firstSegment);
  }
  return null;
};
