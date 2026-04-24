import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface UserPermissions {
  menu: Record<string, boolean>;
  mainMenu: Record<string, boolean>;
  special: Record<string, boolean>;
  columns?: Record<string, boolean>;
}

export const useUserPermissions = () => {
  const { user } = useAuth();
  const { currentOrganization, organizationRole } = useOrganization();
  const queryClient = useQueryClient();

  const userId = user?.id;
  const orgId = currentOrganization?.id;

  // Single shared query across the entire app — deduplicated by react-query
  const { data: permissions = null, isLoading } = useQuery({
    queryKey: ["user_permissions", userId, orgId],
    enabled: !!userId && !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes — permissions rarely change
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    queryFn: async (): Promise<UserPermissions | null> => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permissions")
        .eq("organization_id", orgId!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) {
        console.error("Error fetching user permissions:", error);
        return null;
      }
      return (data?.permissions as unknown as UserPermissions) ?? null;
    },
  });

  // Realtime listener — single subscription, updates the shared cache
  useEffect(() => {
    if (!userId || !orgId) return;
    const channel = supabase
      .channel(`user-permissions-${userId}-${orgId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_permissions",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new && (payload.new as any).permissions) {
          queryClient.setQueryData(
            ["user_permissions", userId, orgId],
            (payload.new as any).permissions as UserPermissions
          );
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, orgId, queryClient]);

  const loading = isLoading;

  // Helper to check if a specific menu item is accessible
  const hasMenuAccess = (menuId: string): boolean => {
    // If no permissions set or admin, allow all
    if (permissions === null) return true;
    return permissions.menu?.[menuId] === true;
  };

  // Helper to check if a main menu category is enabled
  const hasMainMenuAccess = (mainMenuId: string): boolean => {
    // If no permissions set or admin, allow all
    if (permissions === null) return true;
    return permissions.mainMenu?.[mainMenuId] === true;
  };

  // Helper to check special permissions
  const hasSpecialPermission = (permissionId: string): boolean => {
    if (permissions === null) return true;
    return permissions.special?.[permissionId] === true;
  };

  // Helper to check column visibility
  const isColumnVisible = (module: string, columnId: string): boolean => {
    if (permissions === null) return true;
    const key = `${module}.${columnId}`;
    return permissions.columns?.[key] !== false;
  };

  // Check if user is admin with full access (only when no custom permissions are set)
  const isAdmin = organizationRole === "admin" && permissions === null;

  return {
    permissions,
    loading,
    isAdmin,
    hasMenuAccess,
    hasMainMenuAccess,
    hasSpecialPermission,
    isColumnVisible,
  };
};
