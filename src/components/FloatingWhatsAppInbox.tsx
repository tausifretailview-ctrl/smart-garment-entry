import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";

export const FloatingWhatsAppInbox = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  const { hasSpecialPermission, loading: permLoading } = useUserPermissions();
  
  // Tier-based polling - free tier uses manual refresh only
  const { getRefreshInterval } = useTierBasedRefresh();

  // Query unread message count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['whatsapp-unread-count', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return 0;
      
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('unread_count')
        .eq('organization_id', currentOrganization.id)
        .gt('unread_count', 0);
      
      if (error) {
        console.error('Error fetching unread count:', error);
        return 0;
      }
      
      return data?.reduce((sum, conv) => sum + (conv.unread_count || 0), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000, // 30 seconds stale time
    refetchInterval: getRefreshInterval('medium'), // Tier-based: false for free tier
  });

  // Only show on dashboard (root path after org slug)
  const isDashboard = (() => {
    const path = location.pathname;
    if (!currentOrganization?.slug) return false;
    const orgPrefix = `/${currentOrganization.slug}`;
    // Dashboard is either /:orgSlug or /:orgSlug/
    return path === orgPrefix || path === `${orgPrefix}/`;
  })();

  // Don't show if no permission, no org, or not on dashboard
  if (permLoading || !hasSpecialPermission("whatsapp_api") || !currentOrganization || !isDashboard) {
    return null;
  }

  const handleClick = () => {
    navigate(`/${currentOrganization.slug}/whatsapp-inbox`);
  };

  return (
    // Hidden on mobile to avoid overlap with MobileFAB
    <Button
      onClick={handleClick}
      className={cn(
        "fixed bottom-24 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110",
        "hidden lg:flex", // Hide on mobile
        "bg-green-600 hover:bg-green-700"
      )}
      size="icon"
    >
      <MessageSquare className="h-6 w-6 text-white" />
      {unreadCount > 0 && (
        <Badge 
          className="absolute -top-1 -right-1 h-6 min-w-6 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-1.5 animate-pulse"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );
};
