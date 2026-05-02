import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: "free" | "basic" | "professional" | "enterprise";
  enabled_features: string[];
  settings: Record<string, any>;
  organization_type: "business" | "school";
  organization_number: number;
}

interface OrganizationContextType {
  currentOrganization: Organization | null;
  organizations: Organization[];
  organizationRole: "admin" | "manager" | "user" | null;
  loading: boolean;
  fetchError: boolean;
  hasResolvedOrganizations: boolean;
  switchOrganization: (orgId: string) => void;
  refetchOrganizations: () => void;
  hasFeature: (featureName: string) => boolean;
  canAccessFeature: (featureName: string, requiredTier?: string) => boolean;
}

const ORG_FETCH_TIMEOUT = 10000;
const ORG_CACHE_KEY_PREFIX = "cachedOrgs_";

const OrganizationContext = createContext<OrganizationContextType>({
  currentOrganization: null,
  organizations: [],
  organizationRole: null,
  loading: true,
  fetchError: false,
  hasResolvedOrganizations: false,
  switchOrganization: () => {},
  refetchOrganizations: () => {},
  hasFeature: () => false,
  canAccessFeature: () => false,
});

export const useOrganization = () => useContext(OrganizationContext);

const cacheOrgs = (userId: string, orgs: { id: string; slug: string; name: string }[]) => {
  try {
    localStorage.setItem(`${ORG_CACHE_KEY_PREFIX}${userId}`, JSON.stringify(orgs));
  } catch { /* quota exceeded */ }
};

const getCachedOrgs = (userId: string): { id: string; slug: string; name: string }[] | null => {
  try {
    const raw = localStorage.getItem(`${ORG_CACHE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationRole, setOrganizationRole] = useState<"admin" | "manager" | "user" | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [hasResolvedOrganizations, setHasResolvedOrganizations] = useState(false);

  useEffect(() => {
    if (!user) {
      setCurrentOrganization(null);
      setOrganizations([]);
      setOrganizationRole(null);
      setLoading(false);
      setHasResolvedOrganizations(false);
      return;
    }
    fetchOrganizations();
  }, [user?.id]);

  // Helper: run the membership query
  const queryMemberships = async (userId: string) => {
    return supabase
      .from("organization_members")
      .select(`
        id, organization_id, user_id, role,
        organizations (id, name, slug, subscription_tier, enabled_features, settings, organization_type, organization_number)
      `)
      .eq("user_id", userId);
  };

  // Helper: ensure the session JWT is fresh before querying
  const ensureFreshSession = async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;
      const expiresAt = session.expires_at ?? 0;
      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt - nowSec < 60) {
        console.log("Session token near-expiry, refreshing…");
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn("Session refresh failed:", error.message);
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  const fetchOrganizations = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setFetchError(false);
    setHasResolvedOrganizations(false);

    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      console.warn("Organization fetch timed out after", ORG_FETCH_TIMEOUT, "ms");
      setFetchError(true);
      setLoading(false);
    }, ORG_FETCH_TIMEOUT);

    try {
      // Step 1: Ensure session JWT is fresh BEFORE querying
      const sessionOk = await ensureFreshSession();
      if (!sessionOk) {
        clearTimeout(timeoutId);
        if (didTimeout) return;
        console.warn("Session invalid/expired, cannot fetch orgs");
        setFetchError(true);
        setLoading(false);
        return;
      }

      // Step 2: Query memberships
      const { data: memberships, error: membershipError } = await queryMemberships(user.id);
      clearTimeout(timeoutId);
      if (didTimeout) return;
      if (membershipError) throw membershipError;

      let orgs = memberships
        ?.map((m: any) => m.organizations)
        .filter(Boolean) as Organization[];

      // Step 3: Suspicious empty check — if cache says user HAD orgs, retry once with forced refresh
      if ((!orgs || orgs.length === 0) && getCachedOrgs(user.id)?.length) {
        console.warn("Empty org result but cache exists — forcing session refresh and retrying…");
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          console.warn("Refresh failed, signing out:", refreshErr.message);
          await supabase.auth.signOut();
          setFetchError(true);
          setLoading(false);
          return;
        }
        const { data: retryMemberships, error: retryErr } = await queryMemberships(user.id);
        if (retryErr) throw retryErr;
        orgs = retryMemberships
          ?.map((m: any) => m.organizations)
          .filter(Boolean) as Organization[];
      }

      setOrganizations(orgs || []);

      if (orgs && orgs.length > 0) {
        cacheOrgs(user.id, orgs.map(o => ({ id: o.id, slug: o.slug, name: o.name })));
      }

      // Select the right organization
      const selectedOrgSlug = localStorage.getItem("selectedOrgSlug");
      let selectedOrg = orgs?.[0];
      let selectedMembership = memberships?.[0];

      if (selectedOrgSlug) {
        const foundOrg = orgs?.find((o) => o.slug === selectedOrgSlug);
        const foundMembership = memberships?.find((m: any) => m.organizations?.slug === selectedOrgSlug);
        if (foundOrg && foundMembership) {
          selectedOrg = foundOrg;
          selectedMembership = foundMembership;
          sessionStorage.removeItem("selectedOrgSlug");
        }
      } else {
        const storedOrgId = localStorage.getItem(`currentOrgId_${user.id}`);
        if (storedOrgId) {
          const foundOrg = orgs?.find((o) => o.id === storedOrgId);
          const foundMembership = memberships?.find((m: any) => m.organization_id === storedOrgId);
          if (foundOrg && foundMembership) {
            selectedOrg = foundOrg;
            selectedMembership = foundMembership;
          }
        }
      }

      if (selectedOrg && selectedMembership) {
        setCurrentOrganization(selectedOrg);
        setOrganizationRole(selectedMembership.role as any);
        localStorage.setItem(`currentOrgId_${user.id}`, selectedOrg.id);
      }

      setHasResolvedOrganizations(true);
    } catch (error) {
      clearTimeout(timeoutId);
      if (didTimeout) return;
      console.error("Error fetching organizations:", error);
      setFetchError(true);
    } finally {
      if (!didTimeout) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!currentOrganization?.id || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { seedDefaultAccounts } = await import("@/utils/accounting/seedDefaultAccounts");
        await seedDefaultAccounts(currentOrganization.id, supabase);
      } catch (e) {
        if (!cancelled && import.meta.env.DEV) {
          console.warn("Default chart of accounts seed:", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, user?.id]);

  const switchOrganization = async (orgId: string) => {
    if (!user) return;
    const org = organizations.find((o) => o.id === orgId);
    if (!org) return;
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .single();
    if (membership) {
      setCurrentOrganization(org);
      setOrganizationRole(membership.role as any);
      localStorage.setItem(`currentOrgId_${user.id}`, orgId);
    }
  };

  const hasFeature = (featureName: string): boolean => {
    if (!currentOrganization) return false;
    return currentOrganization.enabled_features.includes(featureName);
  };

  const tierHierarchy = { free: 0, basic: 1, professional: 2, enterprise: 3 };

  const canAccessFeature = (featureName: string, requiredTier?: string): boolean => {
    if (!currentOrganization) return false;
    if (hasFeature(featureName)) return true;
    if (requiredTier) {
      const currentTierLevel = tierHierarchy[currentOrganization.subscription_tier];
      const requiredTierLevel = tierHierarchy[requiredTier as keyof typeof tierHierarchy];
      return currentTierLevel >= requiredTierLevel;
    }
    return false;
  };

  return (
    <OrganizationContext.Provider
      value={{
        currentOrganization,
        organizations,
        organizationRole,
        loading,
        fetchError,
        hasResolvedOrganizations,
        switchOrganization,
        refetchOrganizations: fetchOrganizations,
        hasFeature,
        canAccessFeature,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};
