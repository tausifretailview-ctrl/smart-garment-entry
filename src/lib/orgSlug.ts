const ORG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizeOrgSlug = (value?: string | null): string => {
  return (value ?? "").trim().toLowerCase();
};

export const isValidOrgSlug = (value?: string | null): boolean => {
  return ORG_SLUG_PATTERN.test(normalizeOrgSlug(value));
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

  const resolvedSlug = localSlug || sessionSlug;

  if (resolvedSlug) {
    localStorage.setItem("selectedOrgSlug", resolvedSlug);
    sessionStorage.setItem("selectedOrgSlug", resolvedSlug);
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
  return normalized;
};
