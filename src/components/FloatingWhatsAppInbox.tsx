import { useEffect, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";
import {
  fetchActualUnreadMessageCount,
  isCustomerReplyMessage,
} from "@/utils/whatsappInboxUnread";

/** Org home only — hide floating inbox on POS, bills, accounts, etc. */
function isMainDashboardPath(pathname: string, orgSlug?: string | null): boolean {
  if (!orgSlug) return false;
  const prefix = `/${orgSlug}`;
  if (!pathname.startsWith(prefix)) return false;
  const segment = pathname.slice(prefix.length).replace(/^\/+/, "").split("/")[0] ?? "";
  return segment === "" || segment === "dashboard";
}

export const FloatingWhatsAppInbox = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { hasMenuAccess, hasSpecialPermission, loading: permLoading } = useUserPermissions();
  
  const canAccess =
    hasMenuAccess("whatsapp_inbox") ||
    hasSpecialPermission("whatsapp_api") ||
    hasSpecialPermission("whatsapp_send");

  const onMainDashboard = useMemo(
    () => isMainDashboardPath(location.pathname, currentOrganization?.slug),
    [location.pathname, currentOrganization?.slug],
  );

  // Badge = actual inbound messages not yet read (not cached conversation counter).
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['whatsapp-unread-count', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return 0;
      return fetchActualUnreadMessageCount(currentOrganization.id);
    },
    enabled: !!currentOrganization?.id && canAccess && onMainDashboard,
    staleTime: 30_000,
    // No polling — realtime postgres_changes subscription below keeps badge fresh.
    refetchInterval: false,
  });

  // Realtime badge updates (instant alert count without waiting for poll)
  useEffect(() => {
    if (!currentOrganization?.id || !canAccess || !onMainDashboard) return;

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
        (payload) => {
          const msg = payload.new as {
            direction?: string;
            message_type?: string | null;
          };
          if (!isCustomerReplyMessage(msg.direction, msg.message_type)) return;
          queryClient.invalidateQueries({
            queryKey: ["whatsapp-unread-count", currentOrganization.id],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrganization?.id, canAccess, onMainDashboard, queryClient]);

  const onInboxPage = location.pathname.includes("/whatsapp-inbox");

  if (permLoading || !canAccess || !currentOrganization || onInboxPage || !onMainDashboard) {
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
