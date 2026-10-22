import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  CREDIT_STATE_LABEL,
  creditState,
  formatValidUntil,
  type WhatsAppCredits,
} from "@/utils/whatsappCredits";

/**
 * Shop's Ezzy ERP WhatsApp message balance. Shows nothing until the platform admin
 * has added a balance for this shop (no row = not on credits).
 */
export function WhatsAppMessageBalance() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data: credits } = useQuery({
    queryKey: ["whatsapp-message-credits", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_message_credits" as any) as any)
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      // Table not created yet on this database: treat as no balance set.
      if (error) return null;
      return (data ?? null) as WhatsAppCredits | null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  if (!credits) return null;

  const state = creditState(credits);
  const bad = state === "empty" || state === "expired";
  const balance = Number(credits.balance);

  return (
    <Alert variant={bad ? "destructive" : "default"} className={state === "low" ? "border-amber-400" : undefined}>
      <Wallet className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-x-3">
        <span>WhatsApp message balance: {balance.toLocaleString("en-IN")}</span>
        <span className="text-sm font-normal">Valid until {formatValidUntil(credits.valid_until)}</span>
        <span className="text-xs font-normal">({CREDIT_STATE_LABEL[state]})</span>
      </AlertTitle>
      <AlertDescription className="text-xs">
        {state === "expired"
          ? "Your message validity is over. Please contact Ezzy ERP to recharge."
          : state === "empty"
            ? `Your message balance is over${balance < 0 ? ` (${Math.abs(balance).toLocaleString("en-IN")} used extra)` : ""}. Please contact Ezzy ERP to recharge.`
            : state === "low"
              ? "Balance is low. Contact Ezzy ERP to recharge before it runs out."
              : `Each WhatsApp message sent takes 1. Used so far: ${Number(credits.used_count).toLocaleString("en-IN")}.`}
      </AlertDescription>
    </Alert>
  );
}
