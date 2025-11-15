import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

/**
 * Hook to ensure queries are organization-scoped
 * Automatically filters data by current organization
 */
export const useOrganizationData = () => {
  const { currentOrganization } = useOrganization();

  const getOrganizationFilter = () => {
    if (!currentOrganization) {
      throw new Error("No organization selected");
    }
    return { organization_id: currentOrganization.id };
  };

  return {
    organizationId: currentOrganization?.id,
    organizationFilter: getOrganizationFilter,
    isReady: !!currentOrganization,
  };
};
