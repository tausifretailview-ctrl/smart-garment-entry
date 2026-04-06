import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

export const useShopName = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [shopName, setShopName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !currentOrganization?.id) return;

    const fetchShopName = async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("shop_name")
        .eq("user_id", user.id)
        .eq("organization_id", currentOrganization.id)
        .single();

      setShopName(data?.shop_name || null);
    };

    fetchShopName();
  }, [user?.id, currentOrganization?.id]);

  return shopName;
};
