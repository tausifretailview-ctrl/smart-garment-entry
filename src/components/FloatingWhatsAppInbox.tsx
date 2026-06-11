import { useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";
import { fetchActualUnreadMessageCount } from "@/utils/whatsappInboxUnread";

export const FloatingWhatsAppInbox = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { hasMenuAccess, hasSpecialPermission, loading: permLoading } = useUserPermissions();
  
  // Tier-based polling - free tier uses manual refresh only
  const { getRefreshInterval } = useTierBasedRefresh();

  const canAccess =
    hasMenuAccess("whatsapp_inbox") ||
    hasSpecialPermission("whatsapp_api") ||
    hasSpecialPermission("whatsapp_send");

  // Badge = actual inbound messages not yet read (not cached conversation counter).
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['whatsapp-unread-count', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return 0;
      return fetchActualUnreadMessageCount(currentOrganization.id);
    },
    enabled: !!currentOrganization?.id && canAccess,
    staleTime: 30_000,
    refetchInterval: getRefreshInterval('slow'), // Tier-based: false for free tier
  });

  // Realtime badge updates (instant alert count without waiting for poll)
  useEffect(() => {
    if (!currentOrganization?.id || !canAccess) return;

    const channel = supabase
      .channel(`whatsapp-unread-${currentOrganization.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `organization_id=eq.${currentOrganization.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["whatsapp-unread-count", currentOrganization.id],
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `organization_id=eq.${currentOrganization.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["whatsapp-unread-count", currentOrganization.id],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrganization?.id, canAccess, queryClient]);

  const onInboxPage = location.pathname.includes("/whatsapp-inbox");

  if (permLoading || !canAccess || !currentOrganization || onInboxPage) {
    return null;
  }

  const handleClick = () => {
    navigate(`/${currentOrganization.slug}/whatsapp-inbox`, { state: { openUnread: true } });
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
