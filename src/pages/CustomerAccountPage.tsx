import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { CustomerAccountHistoryShell } from "@/components/customer-account/CustomerAccountHistoryShell";

type LocationState = { from?: string; customerName?: string };

export default function CustomerAccountPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const routerNavigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | null) ?? {};
  const organizationId = currentOrganization?.id ?? "";

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ["customer-account-page", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, phone, address")
        .eq("id", customerId!)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId && !!organizationId,
  });

  const handleBack = () => {
    if (locationState.from) {
      orgNavigate(locationState.from);
      return;
    }
    if (window.history.length > 1) {
      routerNavigate(-1);
      return;
    }
    orgNavigate("/sales-invoice-dashboard");
  };

  if (!customerId || !organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
        Invalid customer or organization.
      </div>
    );
  }

  const customerName = customer?.customer_name ?? locationState.customerName ?? "";

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 customer-account-page overflow-hidden">
      <div className="flex-shrink-0 border-b bg-background px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="w-9 h-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">
            {isLoading && !customerName ? "Loading…" : customerName || "Customer"}
            <span className="text-muted-foreground font-normal"> · Customer</span>
          </h1>
          {(customer?.phone || customer?.address) && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {[customer?.phone, customer?.address].filter(Boolean).join(" · ")}
            </p>
          )}
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
          scrollAreaClassName="flex-1 min-h-0"
          wrapperClassName="px-3 sm:px-4 pb-4 flex flex-col flex-1 overflow-hidden min-h-0"
        />
      )}
    </div>
  );
}
