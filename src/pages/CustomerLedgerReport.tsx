import { useOrganization } from "@/contexts/OrganizationContext";
import { CustomerLedger } from "@/components/CustomerLedger";

export default function CustomerLedgerReport() {
  const { currentOrganization } = useOrganization();

  if (!currentOrganization?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <CustomerLedger organizationId={currentOrganization.id} />
    </div>
  );
}