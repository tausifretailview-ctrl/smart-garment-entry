import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

export function useFieldSalesAccess() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ["field-sales-access", user?.id, currentOrganization?.id],
    queryFn: async () => {
      if (!user?.id || !currentOrganization?.id) {
        console.log("Field sales access check: Missing user or org", { userId: user?.id, orgId: currentOrganization?.id });
        return null;
      }

      console.log("Checking field sales access for user:", user.id, "org:", currentOrganization.id);

      // Check if user has an employee record with field_sales_access enabled
      const { data: employee, error } = await supabase
        .from("employees")
        .select("id, employee_name, field_sales_access, user_id")
        .eq("organization_id", currentOrganization.id)
        .eq("user_id", user.id)
        .eq("field_sales_access", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        console.error("Error checking field sales access:", error);
        return null;
      }

      console.log("Field sales access result:", employee);
      return employee;
    },
    enabled: !!user?.id && !!currentOrganization?.id,
  });

  return {
    hasAccess: !!data,
    employeeName: data?.employee_name || null,
    isLoading,
  };
}
