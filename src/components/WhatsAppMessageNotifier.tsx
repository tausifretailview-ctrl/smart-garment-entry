import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

function canAccessWhatsAppInbox(
  hasMenuAccess: (menuId: string) => boolean,
  hasSpecialPermission: (permissionId: string) => boolean,
): boolean {
  return (
    hasMenuAccess("whatsapp_inbox") ||
    hasSpecialPermission("whatsapp_api") ||
    hasSpecialPermission("whatsapp_send")
  );
}

/**
 * Global realtime alerts when customers reply on WhatsApp (org-scoped).
 * Shows in-app toast + optional browser notification when tab is in background.
 */
export function WhatsAppMessageNotifier() {
  const { currentOrganization } = useOrganization();
  const { hasMenuAccess, hasSpecialPermission, loading: permLoading } = useUserPermissions();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { orgNavigate } = useOrgNavigation();
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  const canNotify =
    !permLoading &&
    !!currentOrganization?.id &&
    canAccessWhatsAppInbox(hasMenuAccess, hasSpecialPermission);

  useEffect(() => {
    if (!canNotify || !currentOrganization?.id) return;

    const channel = supabase
      .channel(`whatsapp-notify-${currentOrganization.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `organization_id=eq.${currentOrganization.id}`,
        },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            direction?: string;
            message_text?: string | null;
            conversation_id?: string;
          };

          if (msg.direction !== "inbound") return;
          if (notifiedIdsRef.current.has(msg.id)) return;
          notifiedIdsRef.current.add(msg.id);
          if (notifiedIdsRef.current.size > 200) {
            notifiedIdsRef.current = new Set([...notifiedIdsRef.current].slice(-100));
          }

          let customerLabel = "Customer";
          if (msg.conversation_id) {
            const { data: conv } = await supabase
              .from("whatsapp_conversations")
              .select("customer_name, customer_phone")
              .eq("id", msg.conversation_id)
              .maybeSingle();
            if (conv) {
              customerLabel = conv.customer_name?.trim() || conv.customer_phone || customerLabel;
            }
          }

          const preview =
            (msg.message_text || "").trim().slice(0, 100) || "New WhatsApp message";

          queryClient.invalidateQueries({
            queryKey: ["whatsapp-unread-count", currentOrganization.id],
          });
          queryClient.invalidateQueries({
            queryKey: ["whatsapp-conversations", currentOrganization.id],
          });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });

          const onInboxPage = location.pathname.includes("/whatsapp-inbox");
          if (!onInboxPage) {
            toast(`WhatsApp: ${customerLabel}`, {
              description: preview,
              duration: 10_000,
              icon: <MessageSquare className="h-4 w-4 text-green-600" />,
              action: {
                label: "Open Inbox",
                onClick: () => orgNavigate("/whatsapp-inbox"),
              },
            });
          }

          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.hidden
          ) {
            try {
              const notification = new Notification(`WhatsApp: ${customerLabel}`, {
                body: preview,
                tag: `wa-${msg.conversation_id || msg.id}`,
              });
              notification.onclick = () => {
                window.focus();
                orgNavigate("/whatsapp-inbox");
                notification.close();
              };
            } catch {
              // Browser may block notifications in some contexts
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canNotify, currentOrganization?.id, queryClient, location.pathname, orgNavigate]);

  useEffect(() => {
    if (!canNotify) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    Notification.requestPermission().catch(() => {});
  }, [canNotify]);

  return null;
}
