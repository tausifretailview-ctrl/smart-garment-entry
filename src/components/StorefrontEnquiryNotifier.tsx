import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { storefrontEnquiryAlert, type StorefrontEnquiryRow } from "@/lib/storefrontEnquiryAlert";

const OPEN_MESSAGE = "ezzy-open-path";

/**
 * Website orders, bookings and enquiries pop up in the ERP / installed PWA as
 * they arrive: an in-app toast, plus a phone/desktop notification when the app
 * is in the background. Needs `website_enquiries` in the supabase_realtime
 * publication (migration 20270110140000).
 */
export function StorefrontEnquiryNotifier() {
  const { currentOrganization } = useOrganization();
  const { hasMenuAccess, isAdmin: isAdminPermissions, loading: permLoading } = useUserPermissions();
  const { isAdmin } = useUserRoles();
  const queryClient = useQueryClient();
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const seenRef = useRef<Set<string>>(new Set());
  const navigateRef = useRef(orgNavigate);
  navigateRef.current = orgNavigate;
  const websiteUrlRef = useRef(getOrgPath("/website"));
  websiteUrlRef.current = getOrgPath("/website");

  const orgId = currentOrganization?.id;
  const canNotify =
    !permLoading && !!orgId && (isAdmin || isAdminPermissions || hasMenuAccess("website_settings"));

  // Clicks on a background notification come back from the service worker.
  useEffect(() => {
    if (!canNotify || typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | null;
      // Review alerts route themselves (CustomerReviewNotifier).
      if (data?.type === OPEN_MESSAGE && data.path?.startsWith("/website")) navigateRef.current(data.path);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [canNotify]);

  useEffect(() => {
    if (!canNotify || !orgId) return;

    const channel = supabase
      .channel(`storefront-enquiry-notify-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "website_enquiries",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as StorefrontEnquiryRow;
          if (!row?.id || seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          if (seenRef.current.size > 200) seenRef.current = new Set([...seenRef.current].slice(-100));

          void queryClient.invalidateQueries({ queryKey: ["website_enquiries", orgId] });

          const alert = storefrontEnquiryAlert(row);
          const open = () => navigateRef.current("/website");
          const canAsk =
            typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";

          toast(alert.title, {
            description: alert.body,
            duration: 15_000,
            icon: <ShoppingBag className="h-4 w-4 text-amber-700" />,
            action: { label: "Open", onClick: open },
            // Browsers only honour a permission request made from a click.
            ...(canAsk
              ? {
                  cancel: {
                    label: "Turn on alerts",
                    onClick: () => {
                      void Notification.requestPermission().catch(() => {});
                    },
                  },
                }
              : {}),
          });

          if (document.hidden) {
            void showSystemNotification(alert.title, alert.body, `website-${row.id}`, websiteUrlRef.current, open);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canNotify, orgId, queryClient]);

  return null;
}

/**
 * Installed PWAs on Android only show notifications through the service
 * worker (`new Notification` throws there); desktop browsers accept either.
 */
export async function showSystemNotification(
  title: string,
  body: string,
  tag: string,
  url: string,
  onOpen: () => void,
  route: { path: string; source: string } = { path: "/website", source: "ezzy-website-enquiry" },
) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        // sw-notify.js focuses the open app and posts the in-app path back,
        // or opens `url` when the app is closed.
        data: { source: route.source, path: route.path, url },
      });
      return;
    }
  } catch {
    /* fall through to the page-level Notification */
  }
  try {
    const n = new Notification(title, { body, tag, icon: "/icon-192.png" });
    n.onclick = () => {
      window.focus();
      onOpen();
      n.close();
    };
  } catch {
    /* notifications blocked in this context */
  }
}
