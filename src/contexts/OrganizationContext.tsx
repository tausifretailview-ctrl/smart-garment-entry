import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Organization {
  id: string;
  name: string;
  subscription_tier: "free" | "basic" | "professional" | "enterprise";
  enabled_features: string[];
  settings: Record<string, any>;
}

interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "admin" | "manager" | "user";
}

interface OrganizationContextType {
  currentOrganization: Organization | null;
  organizations: Organization[];
  organizationRole: "admin" | "manager" | "user" | null;
  loading: boolean;
  switchOrganization: (orgId: string) => void;
  hasFeature: (featureName: string) => boolean;
  canAccessFeature: (featureName: string, requiredTier?: string) => boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  currentOrganization: null,
  organizations: [],
  organizationRole: null,
  loading: true,
  switchOrganization: () => {},
  hasFeature: () => false,
  canAccessFeature: () => false,
});

export const useOrganization = () => useContext(OrganizationContext);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationRole, setOrganizationRole] = useState<"admin" | "manager" | "user" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCurrentOrganization(null);
      setOrganizations([]);
      setOrganizationRole(null);
      setLoading(false);
      return;
    }

    fetchOrganizations();
  }, [user]);

  const fetchOrganizations = async () => {
    if (!user) return;

    try {
      // Fetch all organizations the user is a member of
      const { data: memberships, error: membershipError } = await supabase
        .from("organization_members")
        .select(`
          id,
          organization_id,
          user_id,
          role,
          organizations (
            id,
            name,
            subscription_tier,
            enabled_features,
            settings
          )
        `)
        .eq("user_id", user.id);

      if (membershipError) throw membershipError;

      const orgs = memberships
        ?.map((m: any) => m.organizations)
        .filter(Boolean) as Organization[];

      setOrganizations(orgs || []);

      // Get stored organization ID from localStorage
      const storedOrgId = localStorage.getItem(`currentOrgId_${user.id}`);
      
      let selectedOrg = orgs?.[0];
      let selectedMembership = memberships?.[0];

      if (storedOrgId) {
        const foundOrg = orgs?.find((o) => o.id === storedOrgId);
        const foundMembership = memberships?.find((m: any) => m.organization_id === storedOrgId);
        if (foundOrg && foundMembership) {
          selectedOrg = foundOrg;
          selectedMembership = foundMembership;
        }
      }

      if (selectedOrg && selectedMembership) {
        setCurrentOrganization(selectedOrg);
        setOrganizationRole(selectedMembership.role as any);
        localStorage.setItem(`currentOrgId_${user.id}`, selectedOrg.id);
      }
    } catch (error) {
      console.error("Error fetching organizations:", error);
    } finally {
      setLoading(false);
    }
  };

  const switchOrganization = async (orgId: string) => {
    if (!user) return;

    const org = organizations.find((o) => o.id === orgId);
    if (!org) return;

    // Fetch the user's role in this organization
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

  const tierHierarchy = {
    free: 0,
    basic: 1,
    professional: 2,
    enterprise: 3,
  };

  const canAccessFeature = (featureName: string, requiredTier?: string): boolean => {
    if (!currentOrganization) return false;

    // Check if feature is explicitly enabled
    if (hasFeature(featureName)) return true;

    // Check tier-based access
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
        switchOrganization,
        hasFeature,
        canAccessFeature,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};
