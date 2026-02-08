import { useOrganization } from "@/contexts/OrganizationContext";

/**
 * Hook to check if current organization is a school
 * and access school-specific features
 */
export const useSchoolFeatures = () => {
  const { currentOrganization, loading } = useOrganization();

  const isSchool = currentOrganization?.organization_type === "school";
  const isBusiness = currentOrganization?.organization_type === "business" || !currentOrganization?.organization_type;

  return {
    isSchool,
    isBusiness,
    loading,
    organizationType: currentOrganization?.organization_type || "business",
  };
};
