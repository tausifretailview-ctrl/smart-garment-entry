import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface UserPermissions {
  menu: Record<string, boolean>;
  mainMenu: Record<string, boolean>;
  special: Record<string, boolean>;
}

export const useUserPermissions = () => {
  const { user } = useAuth();
  const { currentOrganization, organizationRole } = useOrganization();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!user || !currentOrganization?.id) {
        setPermissions(null);
        setLoading(false);
        return;
      }

      // For all users (including admin), check if custom permissions exist

      try {
        const { data, error } = await supabase
          .from("user_permissions")
          .select("permissions")
          .eq("organization_id", currentOrganization.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data?.permissions) {
          const perms = data.permissions as unknown as UserPermissions;
          setPermissions(perms);
        } else {
          // No custom permissions set - admin gets full access, others get defaults
          setPermissions(null);
        }
      } catch (error) {
        console.error("Error fetching user permissions:", error);
        setPermissions(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user, currentOrganization?.id, organizationRole]);

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

  // Check if user is admin with full access (only when no custom permissions are set)
  const isAdmin = organizationRole === "admin" && permissions === null;

  return {
    permissions,
    loading,
    isAdmin,
    hasMenuAccess,
    hasMainMenuAccess,
    hasSpecialPermission,
  };
};
