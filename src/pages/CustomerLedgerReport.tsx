import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { CustomerLedger } from "@/components/CustomerLedger";
import { WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useVisibilityInvalidate } from "@/hooks/useVisibilityRefetch";
import { getMoneyViewVisibilityQueryKeys } from "@/utils/moneyViewFreshnessInvalidation";

export default function CustomerLedgerReport() {
  const { currentOrganization } = useOrganization();
  const [searchParams] = useSearchParams();
  const preSelectedCustomerId = searchParams.get("customer");
  const orgId = currentOrganization?.id;
  const visibilityKeys = useMemo(
    () => (orgId ? getMoneyViewVisibilityQueryKeys(orgId) : []),
    [orgId],
  );
  useVisibilityInvalidate(visibilityKeys);

  if (!currentOrganization?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <CustomerLedger
        organizationId={currentOrganization.id}
        preSelectedCustomerId={preSelectedCustomerId}
        persistenceWindowId={WINDOW_FILTER_IDS.customerLedgerReport}
      />
    </div>
  );
}