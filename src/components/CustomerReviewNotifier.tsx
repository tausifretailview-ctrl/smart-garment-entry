import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { customerReviewAlert, type CustomerReviewAlertRow } from "@/lib/customerReviewAlert";
import { showSystemNotification } from "@/components/StorefrontEnquiryNotifier";

const OPEN_MESSAGE = "ezzy-open-path";
const REVIEWS_PATH = "/customer-reviews";

type FeedbackInsert = CustomerReviewAlertRow & { id?: string; sale_id?: string };

/**
 * New customer reviews (bill link, Bill & Offers app, WhatsApp) pop up in the ERP /
 * installed PWA as they arrive: an in-app toast, plus a phone/desktop notification when
 * the app is in the background. Tapping opens Reports → Customer Reviews. Needs
 * `customer_feedback` in the supabase_realtime publication (migration 20270114120000_customer_review_alerts).
 */
export function CustomerReviewNotifier() {
  const { currentOrganization } = useOrganization();
  const { hasMenuAccess, isAdmin: isAdminPermissions, loading: permLoading } = useUserPermissions();
  const { isAdmin } = useUserRoles();
  const queryClient = useQueryClient();
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const seenRef = useRef<Set<string>>(new Set());
  const navigateRef = useRef(orgNavigate);
  navigateRef.current = orgNavigate;
  const reviewsUrlRef = useRef(getOrgPath(REVIEWS_PATH));
  reviewsUrlRef.current = getOrgPath(REVIEWS_PATH);

  const orgId = currentOrganization?.id;
  const canNotify =
    !permLoading && !!orgId && (isAdmin || isAdminPermissions || hasMenuAccess("sales_invoice_dashboard"));

  // Clicks on a background notification come back from the service worker.
  useEffect(() => {
    if (!canNotify || typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | null;
      if (data?.type === OPEN_MESSAGE && data.path === REVIEWS_PATH) navigateRef.current(REVIEWS_PATH);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [canNotify]);

  useEffect(() => {
    if (!canNotify || !orgId) return;

    const announce = async (row: FeedbackInsert) => {
      // The row has only the sale id: look up the bill number and customer for the text.
      let sale: { sale_number: string | null; customer_name: string | null } | null = null;
      if (row.sale_id) {
        const { data } = await supabase
          .from("sales")
          .select("sale_number, customer_name")
          .eq("organization_id", orgId)
          .eq("id", row.sale_id)
          .maybeSingle();
        sale = data ?? null;
      }
      const alert = customerReviewAlert(row, sale);
      const open = () => navigateRef.current(REVIEWS_PATH);
      const canAsk =
        typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";

      toast(alert.title, {
        description: alert.body,
        duration: alert.unhappy ? 30_000 : 12_000,
        icon: <Star className="h-4 w-4 fill-amber-400 text-amber-500" />,
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
        void showSystemNotification(alert.title, alert.body, `review-${row.id}`, reviewsUrlRef.current, open, {
          path: REVIEWS_PATH,
          source: "ezzy-customer-review",
        });
      }
    };

    const channel = supabase
      .channel(`customer-review-notify-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_feedback",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as FeedbackInsert;
          if (!row?.id || seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          if (seenRef.current.size > 200) seenRef.current = new Set([...seenRef.current].slice(-100));
          void queryClient.invalidateQueries({ queryKey: ["customer-reviews", orgId] });
          void announce(row).catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canNotify, orgId, queryClient]);

  return null;
}
