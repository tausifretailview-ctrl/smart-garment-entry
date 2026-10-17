import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BulkWhatsAppWorkspace } from "@/components/bulk-whatsapp/BulkWhatsAppWorkspace";

export default function BulkWhatsApp() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  if (!currentOrganization?.id) return null;
  return <BulkWhatsAppWorkspace organizationId={currentOrganization.id} userId={user?.id} />;
}
