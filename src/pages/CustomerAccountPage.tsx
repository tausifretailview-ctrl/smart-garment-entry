import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { CustomerAccountHistoryShell } from "@/components/customer-account/CustomerAccountHistoryShell";

export default function CustomerAccountPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { currentOrganization } = useOrganization();
  const { navigate } = useOrgNavigation();
  const organizationId = currentOrganization?.id ?? "";

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ["customer-account-page", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name")
        .eq("id", customerId!)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId && !!organizationId,
  });

  if (!customerId || !organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
        Invalid customer or organization.
      </div>
    );
  }

  const customerName = customer?.customer_name ?? "";

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-blue-600 to-violet-500 flex-shrink-0" />
      <div className="p-4 sm:p-5 pb-0 bg-slate-50 flex-shrink-0 flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-1 w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors flex-shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-blue-600 tracking-tight leading-tight truncate">
            {isLoading ? "Loading…" : customerName || "Customer"}
          </h1>
          <p className="text-slate-400 text-base mt-0.5">
            Customer account history and transactions
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !customer ? (
        <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
          Customer not found.
        </div>
      ) : (
        <CustomerAccountHistoryShell
          customerId={customerId}
          customerName={customerName}
          organizationId={organizationId}
          queriesEnabled
          scrollAreaClassName="flex-1 mt-3 min-h-[calc(100vh-18rem)]"
          wrapperClassName="px-3 sm:px-6 pb-4 flex flex-col flex-1 overflow-hidden min-h-0"
        />
      )}
    </div>
  );
}
