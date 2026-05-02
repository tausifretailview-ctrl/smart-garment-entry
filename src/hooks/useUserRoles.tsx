import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AppRole = "admin" | "manager" | "user" | "platform_admin";

export const useUserRoles = (organizationId?: string) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Track retry count with ref to persist across effect runs
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  useEffect(() => {
    // Reset retry count on dependency change
    retryCountRef.current = 0;
    
    const fetchRoles = async () => {
      if (!user) {
        setRoles([]);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setError(null);
        
        // Fetch global user roles
        const { data: globalRoles, error: globalError } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (globalError) throw globalError;

        const allRoles: AppRole[] = globalRoles?.map((r: any) => r.role as AppRole) || [];

        // Also fetch organization-specific role if organization is available
        const orgId =
          organizationId ||
          (user.id ? localStorage.getItem(`currentOrgId_${user.id}`) : null) ||
          localStorage.getItem("selectedOrgId");
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
        setLoading(false);
        retryCountRef.current = 0; // Reset on success
      } catch (err: any) {
        // Only log in development
        if (import.meta.env.DEV) {
          console.error("Error fetching roles:", err);
        }
        
        // Retry on network/fetch errors with exponential backoff
        const isNetworkError = err?.message?.includes('fetch') || 
                               err?.message?.includes('network') ||
                               err?.message?.includes('Failed to fetch') ||
                               err?.code === 'NETWORK_ERROR';
        
        if (isNetworkError && retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = 1000 * Math.pow(2, retryCountRef.current - 1); // 1s, 2s, 4s
          setTimeout(fetchRoles, delay);
          return;
        }
        
        setError(err);
        setRoles([]);
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
    error,
    hasRole,
    isAdmin,
    isManager,
    isPlatformAdmin,
    canAccessSettings,
    canAccessPurchases,
  };
};
