import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AppRole = "admin" | "manager" | "user" | "platform_admin";

export const useUserRoles = (organizationId?: string) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoles = async () => {
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }

      try {
        // Fetch global user roles
        const { data: globalRoles, error: globalError } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (globalError) throw globalError;

        const allRoles: AppRole[] = globalRoles?.map((r: any) => r.role as AppRole) || [];

        // Also fetch organization-specific role if organization is available
        const orgId = organizationId || localStorage.getItem("selectedOrgId");
        if (orgId) {
          const { data: orgMember, error: orgError } = await supabase
            .from("organization_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("organization_id", orgId)
            .maybeSingle();

          if (!orgError && orgMember?.role && !allRoles.includes(orgMember.role as AppRole)) {
            allRoles.push(orgMember.role as AppRole);
          }
        }

        setRoles(allRoles);
      } catch (error) {
        console.error("Error fetching roles:", error);
        setRoles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, [user, organizationId]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");
  const isManager = hasRole("manager");
  const isPlatformAdmin = hasRole("platform_admin");
  const canAccessSettings = isAdmin;
  const canAccessPurchases = isAdmin || isManager;

  return {
    roles,
    loading,
    hasRole,
    isAdmin,
    isManager,
    isPlatformAdmin,
    canAccessSettings,
    canAccessPurchases,
  };
};
