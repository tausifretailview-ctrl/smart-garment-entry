import { useOrganization } from "@/contexts/OrganizationContext";
import { CustomerLedger } from "@/components/CustomerLedger";
import { useSearchParams } from "react-router-dom";

export default function StudentLedger() {
  const { currentOrganization } = useOrganization();
  const [searchParams] = useSearchParams();
  const preSelectedStudentId = searchParams.get("student");

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
        preSelectedCustomerId={preSelectedStudentId} 
      />
    </div>
  );
}
